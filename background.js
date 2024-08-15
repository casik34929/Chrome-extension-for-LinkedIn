chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { commentContent, model } = request;

  if (!chrome.storage || !chrome.storage.sync) {
    sendResponse({ error: "chrome.storage is not available" });
    return true;
  }

  chrome.storage.sync.get(["OPENAI_API_KEY"], async (result) => {
    const OPENAI_API_KEY = result.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      sendResponse({ error: "OPENAI_API_KEY is not set" });
      return true;
    }

    try {
      const response = await fetchOpenAiResponse(commentContent, model, OPENAI_API_KEY);
      sendResponse(response);
    } catch (error) {
      console.error("Error during API request:", error);
      sendResponse({ error: error.message });
    }
  });

  return true;  // Indicates to keep the message channel open for the async response
});

async function fetchOpenAiResponse(commentContent, model, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [{
        "role": "user",
        "content": commentContent
      }]
    })
  });

  const data = await response.json();

  if (data.choices && data.choices.length > 0 && data.choices[0].message) {
    return { suggestedResponse: data.choices[0].message.content.trim() };
  } else {
    throw new Error("Unexpected API response structure");
  }
}