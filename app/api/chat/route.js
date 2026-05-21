export async function POST(request) {
  try {
    const { messages, system } = await request.json();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system,
        messages,
      }),
    });

    const data = await response.json();
    console.log("Anthropic response:", JSON.stringify(data).substring(0, 500));

    if (!response.ok) {
      return Response.json({
        error: data.error?.message || "API error",
        status: response.status,
        details: data,
      }, { status: 200 });
    }

    return Response.json(data);
  } catch (err) {
    console.error("Chat route error:", err);
    return Response.json({
      error: err.message,
      content: [{ type: "text", text: "Internal error: " + err.message }]
    }, { status: 200 });
  }
}
