import { NextResponse } from "next/server";
import { sessionFromRequest, readSessionIdentity, attachSessionCookie } from "@/lib/mimoLoginSession";


export async function GET(request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const sess = sessionFromRequest(request);
  if (!sess || (state && sess.state !== state)) {
    return NextResponse.json({ status: "expired" }, { status: 404 });
  }

  if (sess.status !== "done") {

    if (readSessionIdentity(sess)) sess.status = "done";
  }

  if (sess.status !== "done") {

    return attachSessionCookie(NextResponse.json({ status: "pending", region: sess.region }), sess);
  }

  const id = readSessionIdentity(sess);
  if (!id) {
    return attachSessionCookie(
      NextResponse.json({ status: "error", error: "session captured but passToken missing" }),
      sess,
    );
  }

  const payload = { status: "done", region: sess.region, ...id };

  const res = NextResponse.json(payload);
  res.cookies.set("9r_mimo_login", "", { path: "/", httpOnly: true, maxAge: 0 });
  return res;
}
