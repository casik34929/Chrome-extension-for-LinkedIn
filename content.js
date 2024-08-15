chrome.runtime.sendMessage({
  action: "analyzeComment",
  model: "gpt-3.5-turbo"
}, response => {
  if (response.error) {
    console.error(response.error);
  } else {
    console.log(response.suggestedResponse);
  }
});