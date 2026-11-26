/**
 * Strip <thinking>...</thinking> tags from SSE streaming responses
 * for specific models that should not expose internal reasoning.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Models yang harus di-strip thinking tags
const STRIP_THINKING_MODELS = new Set([
  'cc/claude-opus-5.5',
  'kiro/claude-sonnet-4.5-thinking-agentic'
]);

export function shouldStripThinking(model) {
  return STRIP_THINKING_MODELS.has(model);
}

// Strip thinking tags from plain text
function stripThinkingFromText(text) {
  if (!text) return text;
  return text.replace(/<thinking>[\s\S]*?<\/thinking>\n?/g, '');
}

export async function stripThinkingFromSSE(response, model) {
  if (!shouldStripThinking(model)) {
    return response;
  }

  // Clone response to read body
  const cloned = response.clone();
  
  // Try to detect if this is a non-streaming JSON response
  const contentType = response.headers.get('content-type') || '';
  
  // For SSE streams, content-type is text/event-stream
  if (!contentType.includes('text/event-stream')) {
    try {
      const json = await cloned.json();
      if (json.choices?.[0]?.message?.content) {
        json.choices[0].message.content = stripThinkingFromText(json.choices[0].message.content);
      }
      return new Response(JSON.stringify(json), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      // Not JSON, return original
      return response;
    }
  }

  // Handle SSE streaming
  const originalStream = response.body;
  let buffer = '';
  let inThinking = false;

  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = originalStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete SSE messages
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || ''; // Keep incomplete message in buffer

          for (const message of lines) {
            if (!message.trim()) continue;

            // Parse SSE data field
            const dataMatch = message.match(/^data: (.+)$/m);
            if (!dataMatch) {
              // Pass through non-data lines (comments, etc)
              controller.enqueue(encoder.encode(message + '\n\n'));
              continue;
            }

            let data;
            try {
              data = JSON.parse(dataMatch[1]);
            } catch {
              // Pass through invalid JSON as-is
              controller.enqueue(encoder.encode(message + '\n\n'));
              continue;
            }

            // Check if this is a [DONE] marker
            if (dataMatch[1] === '[DONE]') {
              controller.enqueue(encoder.encode(message + '\n\n'));
              continue;
            }

            // Strip thinking from content delta
            if (data.choices?.[0]?.delta?.content) {
              let content = data.choices[0].delta.content;
              
              if (inThinking) {
                const endIdx = content.indexOf('</thinking>');
                if (endIdx >= 0) {
                  inThinking = false;
                  content = content.slice(endIdx + 11).replace(/^\n/, '');
                } else {
                  content = ''; // Still inside thinking block
                }
              } else {
                const startIdx = content.indexOf('<thinking>');
                if (startIdx >= 0) {
                  const endIdx = content.indexOf('</thinking>', startIdx + 10);
                  if (endIdx >= 0) {
                    // Complete thinking block in this chunk
                    content = content.slice(0, startIdx) + content.slice(endIdx + 11).replace(/^\n/, '');
                  } else {
                    // Thinking block starts but doesn't end
                    inThinking = true;
                    content = content.slice(0, startIdx);
                  }
                }
              }

              data.choices[0].delta.content = content;
            }

            // Re-encode and send
            const newMessage = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(newMessage));
          }
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          controller.enqueue(encoder.encode(buffer));
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    }
  });

  return new Response(transformedStream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}
