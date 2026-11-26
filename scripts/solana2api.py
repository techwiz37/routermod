#!/usr/bin/env python3
"""
solana2api — OpenAI-compatible bridge for solana.ai/chat

Client (OpenAI format) -> FastAPI -> Camoufox (headful/Xvfb) -> solana.ai/chat
The browser handles the Vercel challenge, HPKE enclave and x-is-human JWE.

Run:
  python -m camoufox fetch
  xvfb-run -a python solana2api.py

RouterMod consumes this as the noAuth "solana" provider (prefix: sol/).
Leave SOLANA2API_KEY empty — the RouterMod noAuth stub sends "Bearer public".
"""
import asyncio
import json
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

PORT = int(os.getenv("SOLANA2API_PORT", "18620"))
HOST = os.getenv("SOLANA2API_HOST", "0.0.0.0")
PROXY = os.getenv("SOLANA2API_PROXY", "").strip()
HEADLESS = os.getenv("SOLANA2API_HEADLESS", "0") == "1"
TIMEOUT = int(os.getenv("SOLANA2API_TIMEOUT", "120"))
API_KEY = os.getenv("SOLANA2API_KEY", "")

MODEL_MAP = {
    "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
    "deepseek/deepseek-v4.1-flash:encrypted": "DeepSeek V4.1 Flash",
    "solana": "DeepSeek V4.1 Flash",
    "gpt-oss-120b": "gpt-oss-120b",
}


def _parse_proxy(px: str):
    if not px:
        return None
    m = re.match(r"https?://([^:]+):([^@]+)@([^:]+):(\d+)", px)
    if m:
        return {"server": f"http://{m.group(3)}:{m.group(4)}", "username": m.group(1), "password": m.group(2)}
    m = re.match(r"https?://([^:]+):(\d+)", px)
    if m:
        return {"server": f"http://{m.group(1)}:{m.group(2)}"}
    return None


def _load_proxies() -> List[str]:
    path = os.getenv("SOLANA2API_PROXY_FILE", "")
    if path and os.path.exists(path):
        with open(path) as f:
            return [l.strip() for l in f if l.strip() and not l.startswith("#")]
    if PROXY:
        return [PROXY]
    return []


PROXIES = _load_proxies()
_px_idx = 0


def _next_proxy() -> Optional[str]:
    global _px_idx
    if not PROXIES:
        return None
    px = PROXIES[_px_idx % len(PROXIES)]
    _px_idx += 1
    return px


class SolanaWorker:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._browser = None
        self._page = None
        self._ready = False
        self._proxy_used = None

    async def _teardown(self):
        try:
            if self._browser:
                await self._browser.__aexit__(None, None, None)
        except Exception:
            pass
        self._browser = None
        self._page = None
        self._ready = False

    async def _ensure(self, force_proxy: Optional[str] = None):
        if self._ready and self._page and not self._page.is_closed():
            return
        await self._teardown()
        from camoufox.async_api import AsyncCamoufox

        px = force_proxy or _next_proxy()
        self._proxy_used = px
        proxy = _parse_proxy(px) if px else None
        kwargs = dict(headless=HEADLESS, humanize=True, locale="en-US",
                      geoip=bool(proxy), i_know_what_im_doing=True)
        if proxy:
            kwargs["proxy"] = proxy
            print(f"[worker] proxy {proxy['server']}")

        self._browser = await AsyncCamoufox(**kwargs).__aenter__()
        ctx = await self._browser.new_context(viewport={"width": 1440, "height": 900})
        self._page = await ctx.new_page()

        print("[worker] buka solana.ai/chat")
        await self._page.goto("https://solana.ai/chat", wait_until="domcontentloaded", timeout=90000)
        await asyncio.sleep(8)

        for sel in ["text=Start chatting", "button:has-text('Start chatting')"]:
            try:
                await self._page.locator(sel).first.click(timeout=6000)
                print("[worker] modal dismissed")
                break
            except Exception:
                pass
        await asyncio.sleep(2)

        body = (await self._page.inner_text("body"))[:300]
        if "This request was blocked" in body or "403 FORBIDDEN" in body:
            raise RuntimeError("PROXY_BLOCKED")
        if "Failed to verify" in body or "Security Checkpoint" in body:
            raise RuntimeError("CHALLENGE_FAILED")
        if await self._page.locator("textarea").count() == 0:
            raise RuntimeError("NO_TEXTAREA")

        self._ready = True
        print("[worker] siap")

    async def ask(self, prompt: str, timeout: int = TIMEOUT) -> Dict[str, Any]:
        async with self._lock:
            last_err = None
            max_try = min(12, max(1, len(PROXIES))) if PROXIES else 1
            for attempt in range(max_try):
                try:
                    await self._ensure()
                    break
                except RuntimeError as e:
                    last_err = e
                    msg = str(e)
                    print(f"[worker] attempt {attempt+1}/{max_try} gagal: {msg}")
                    await self._teardown()
                    if msg not in ("PROXY_BLOCKED", "CHALLENGE_FAILED", "NO_TEXTAREA"):
                        raise
                    await asyncio.sleep(1)
            else:
                raise RuntimeError(f"semua {max_try} proxy gagal: {last_err}")

            page = self._page
            t0 = time.time()

            try:
                await page.locator("text=New chat").first.click(timeout=4000)
                await asyncio.sleep(1.5)
                for sel in ["text=Start chatting", "button:has-text('Start chatting')"]:
                    try:
                        await page.locator(sel).first.click(timeout=3000)
                        break
                    except Exception:
                        pass
                await asyncio.sleep(1.0)
            except Exception:
                pass

            try:
                await page.wait_for_selector("textarea", timeout=8000)
            except Exception:
                await page.goto("https://solana.ai/chat", wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(4)
                for sel in ["text=Start chatting", "button:has-text('Start chatting')"]:
                    try:
                        await page.locator(sel).first.click(timeout=4000)
                        break
                    except Exception:
                        pass
                await asyncio.sleep(1.5)

            ta = page.locator("textarea").first
            await ta.fill(prompt)
            await asyncio.sleep(0.4)
            await page.keyboard.press("Enter")

            deadline = time.time() + timeout
            text = ""
            while time.time() < deadline:
                await asyncio.sleep(1.5)
                try:
                    raw = await page.evaluate("() => { const m=document.querySelector('main'); return m?m.innerText:''; }")
                except Exception:
                    raw = ""
                if "Assistant said:" not in raw:
                    continue
                try:
                    text = await page.evaluate("""() => {
                        const ps = document.querySelectorAll('main p.whitespace-pre-wrap');
                        for (let i = ps.length - 1; i >= 0; i--) {
                            const t = (ps[i].innerText || '').trim();
                            if (t) return t;
                        }
                        return '';
                    }""")
                except Exception:
                    text = ""
                if not text:
                    text = self._extract(raw)
                if text and "tokens" in raw:
                    break

            elapsed = time.time() - t0
            return {"text": text.strip(), "elapsed": elapsed}

    @staticmethod
    def _extract(raw: str) -> str:
        if "Assistant said:" not in raw:
            return ""
        body = raw.split("Assistant said:", 1)[1]
        for stop in ("\nConfidential\nDeepSeek", "\nDeepSeek V4.1 Flash ·", "\nMessage\n"):
            if stop in body:
                body = body.split(stop, 1)[0]
        body = re.sub(r"^\s*Reasoning\s*", "", body)
        lines = [l for l in body.split("\n") if l.strip() and not re.fullmatch(r"Confidential", l.strip())]
        return "\n".join(lines).strip()

    async def close(self):
        try:
            if self._browser:
                await self._browser.__aexit__(None, None, None)
        except Exception:
            pass


worker = SolanaWorker()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[boot] solana2api :{PORT} headless={HEADLESS} proxy={'yes' if PROXY or PROXIES else 'no'}")
    yield
    await worker.close()


app = FastAPI(title="solana2api", lifespan=lifespan)


def _check_auth(authorization: Optional[str]):
    if not API_KEY:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer")
    if authorization.split(" ", 1)[1].strip() != API_KEY:
        raise HTTPException(401, "invalid key")


class ChatMessage(BaseModel):
    role: str
    content: Any = None
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None


class ToolFunction(BaseModel):
    name: str
    description: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class Tool(BaseModel):
    type: str = "function"
    function: ToolFunction


class ChatRequest(BaseModel):
    model: str = "deepseek-v4.1-flash"
    messages: List[ChatMessage]
    stream: bool = False
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    tools: Optional[List[Tool]] = None
    tool_choice: Optional[Any] = None
    parallel_tool_calls: Optional[bool] = None


TOOL_SYSTEM = """You have access to tools. When you need to call a tool, reply ONLY with a JSON object and nothing else:

{"tool_calls":[{"name":"<tool_name>","arguments":{...}}]}

Available tools:
%s

Rules:
- Call a tool ONLY when required to answer.
- Output raw JSON only, no markdown fences, no explanation.
- If no tool is needed, answer normally in plain text.
- Multiple calls allowed: {"tool_calls":[{"name":"a","arguments":{}},{"name":"b","arguments":{}}]}
"""


def _render_tools(tools: List[Tool]) -> str:
    lines = []
    for t in tools:
        fn = t.function
        params = json.dumps(fn.parameters or {"type": "object", "properties": {}}, ensure_ascii=False)
        desc = (fn.description or "").strip().replace("\n", " ")
        lines.append(f"- {fn.name}({params}) — {desc}")
    return "\n".join(lines)


def _parse_tool_calls(text: str) -> Optional[List[Dict[str, Any]]]:
    if not text:
        return None
    candidates = []
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "")
    for m in re.finditer(r"\{", cleaned):
        depth, start = 0, m.start()
        for i in range(start, len(cleaned)):
            if cleaned[i] == "{":
                depth += 1
            elif cleaned[i] == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(cleaned[start:i + 1])
                    break
    for c in candidates:
        try:
            obj = json.loads(c)
        except Exception:
            continue
        calls = obj.get("tool_calls") if isinstance(obj, dict) else None
        if not isinstance(calls, list) or not calls:
            continue
        out = []
        for i, call in enumerate(calls):
            if not isinstance(call, dict):
                continue
            name = call.get("name") or (call.get("function") or {}).get("name")
            args = call.get("arguments", (call.get("function") or {}).get("arguments", {}))
            if not name:
                continue
            if not isinstance(args, str):
                args = json.dumps(args, ensure_ascii=False)
            out.append({"id": f"call_{uuid.uuid4().hex[:16]}", "type": "function",
                        "function": {"name": name, "arguments": args}})
        if out:
            return out
    return None


@app.get("/v1/models")
async def models():
    return {"object": "list", "data": [
        {"id": k, "object": "model", "created": 0, "owned_by": "solana-ai"}
        for k in ("deepseek-v4.1-flash", "solana", "gpt-oss-120b")
    ]}


@app.get("/health")
async def health():
    return {"ok": True, "ready": worker._ready, "headless": HEADLESS}


@app.post("/v1/chat/completions")
async def chat(req: ChatRequest, authorization: Optional[str] = None):
    _check_auth(authorization)

    parts = []
    for m in req.messages:
        c = m.content
        if isinstance(c, list):
            c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
        if m.role == "system":
            parts.append(f"[system] {c}")
        elif m.role == "user":
            parts.append(str(c or ""))
        elif m.role == "assistant":
            if m.tool_calls:
                tc = json.dumps([{"name": t["function"]["name"],
                                  "arguments": json.loads(t["function"]["arguments"] or "{}")}
                                 for t in m.tool_calls], ensure_ascii=False)
                parts.append(f"[assistant called tools] {tc}")
                if c:
                    parts.append(f"[assistant] {c}")
            else:
                parts.append(f"[assistant] {c or ''}")
        elif m.role == "tool":
            parts.append(f"[tool result for {m.name or m.tool_call_id}] {c}")

    if req.tools:
        has_tool_result = any(m.role == "tool" for m in req.messages)
        spec = TOOL_SYSTEM % _render_tools(req.tools)
        if has_tool_result:
            spec += ("\nIMPORTANT: Tool results are already provided above. "
                     "Do NOT call any tool again. Answer the user directly in plain text now.\n")
        parts.insert(0, spec)

    prompt = "\n\n".join(parts)

    try:
        res = await worker.ask(prompt)
    except Exception as e:
        raise HTTPException(502, f"upstream: {type(e).__name__}: {str(e)[:200]}")

    text = res["text"]
    cid = f"chatcmpl-{uuid.uuid4().hex[:16]}"
    created = int(time.time())
    approx_tokens = max(1, len(text) // 4)
    tool_calls = _parse_tool_calls(text) if req.tools else None

    if not req.stream:
        if tool_calls:
            msg = {"role": "assistant", "content": None, "tool_calls": tool_calls}
            finish = "tool_calls"
        else:
            msg = {"role": "assistant", "content": text}
            finish = "stop"
        return JSONResponse({
            "id": cid, "object": "chat.completion", "created": created,
            "model": req.model,
            "choices": [{"index": 0, "message": msg, "finish_reason": finish}],
            "usage": {"prompt_tokens": max(1, len(prompt) // 4),
                      "completion_tokens": approx_tokens,
                      "total_tokens": max(1, len(prompt) // 4) + approx_tokens},
        })

    async def gen():
        if tool_calls:
            delta = {"role": "assistant", "content": None,
                     "tool_calls": [{"index": i, **tc} for i, tc in enumerate(tool_calls)]}
            chunk = {"id": cid, "object": "chat.completion.chunk", "created": created,
                     "model": req.model,
                     "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
            yield f"data: {json.dumps(chunk)}\n\n"
            done = {"id": cid, "object": "chat.completion.chunk", "created": created,
                    "model": req.model,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]}
            yield f"data: {json.dumps(done)}\n\n"
            yield "data: [DONE]\n\n"
            return

        chunk = {"id": cid, "object": "chat.completion.chunk", "created": created,
                 "model": req.model,
                 "choices": [{"index": 0, "delta": {"role": "assistant", "content": text},
                              "finish_reason": None}]}
        yield f"data: {json.dumps(chunk)}\n\n"
        done = {"id": cid, "object": "chat.completion.chunk", "created": created,
                "model": req.model,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
        yield f"data: {json.dumps(done)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
