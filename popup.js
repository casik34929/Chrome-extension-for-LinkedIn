// time  interval for each comment processing
const PERIOD = 5000;

// initialize the extension when the Dom is loaded
document.addEventListener("DOMContentLoaded", () => {
  initialize();
});

// function to initialize the extension by loading stored data
async function initialize() {
  try {
    const { OPENAI_API_KEY, prompt } = await getStoredData(["OPENAI_API_KEY", "prompt"]);
    displayStoredData(OPENAI_API_KEY, prompt || "Analyze this comment and provide an appropriate response. Just reply to the comment without any introductory text. Use the pronoun 'I' every time as if you were me");
  } catch (error) {
    console.error("Error during initialization:", error);
  }
}

// function to get stored data from chrome storage
function getStoredData(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

// function to display the stored data in the Ui
function displayStoredData(apiKey, prompt) {
  document.getElementById("apiKey").value = apiKey || "";
  document.getElementById("customPrompt").value = prompt || "";
}

// function to show status message to the user
function showStatus(message) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  setTimeout(() => { statusElement.textContent = ''; }, 3000);
}

// event listener to save the api key
document.getElementById("saveApiKey").addEventListener("click", async () => {
  const OPENAI_API_KEY = document.getElementById("apiKey").value.trim();

  if (!OPENAI_API_KEY) {
    showStatus('OPENAI_API_KEY is not defined. Please first save your API key.');
    return;
  }

  try {
    await saveApiKey(OPENAI_API_KEY);
    showStatus('API key saved');
  } catch (error) {
    console.error("Error saving API key:", error);
  }
});

// function to save the api key to chrome storage
async function saveApiKey(apiKey) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ OPENAI_API_KEY: apiKey }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// function to start the auto-comment feature
async function startAutoComment() {
  try {
    const { OPENAI_API_KEY } = await getStoredData(["OPENAI_API_KEY"]);

    if (!OPENAI_API_KEY) {
      showStatus('OPENAI_API_KEY is not defined. Please first save your API key.');
      return;
    }

    const prompt = document.getElementById("customPrompt").value.trim();
    if (!prompt) {
      showStatus('Please enter a prompt.');
      return;
    }

    await savePrompt(prompt);

    const model = document.getElementById("aiModel").value;
    const [tab] = await getActiveTab();

    resetButton("stop");

    try {
      await executeAutoReplyScript(tab.id, prompt, PERIOD, model);
    } catch (error) {
      console.error("Error during auto-reply process:", error);
      resetButton("start");
    }
  } catch (error) {
    console.error("Error during auto-reply process:", error);
  }
}

function resetButton(state) {
  const button = document.getElementById("toggleAutoComment");
  button.setAttribute("data-state", state);
  button.innerHTML = state === "start" ? startSvg() : stopSvg();
}

// Function to stop the auto-comment feature
function stopAutoComment() {
  resetButton("start");
  // send a message to the content script to stop the auto-reply script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "stopAutoReply" });
    }
  });
}

// function to save the prompt to chrome storage
function savePrompt(prompt) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ prompt }, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

// function to get the active tab
function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(tabs);
      }
    });
  });
}

// function to execute the auto-reply script in the active tab
function executeAutoReplyScript(tabId, prompt, period, model) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: autoReplyScript,
    args: [prompt, period, model]
  });
}

// actual auto-reply script that will be injected in the active tab
async function autoReplyScript(prompt, period, model) {
  const SELECTORS = {
    commentItem: ".comments-comments-list .comments-comments-list__comment-item",
    commentContainer: ".comments-comments-list .comments-comment-list__container",
    commentItemMainContent: ".comments-comment-item__inline-show-more-text",
    replyButton: ".reply",
    commentBox: ".editor-content p",
    submitButton: ".comments-comment-box__submit-button",
    artdecoButton: ".align-items-center .artdeco-button",
    loadMoreButton: ".comments-comments-list__load-more-comments-button"
  };

  let count = 0;
  cnt_comment = 0;
  let cursor = document.querySelector(SELECTORS.commentItem);
  let stopFlag = false;

  if (!cursor) {
    cursor = document.querySelector(SELECTORS.commentContainer).children[cnt_comment];
    if (!cursor) {
      console.error("No comments found on the page.");
      return;
    }
  }

  // function to move the next comment
  async function next() {
    if (count) {
      cursor = cursor.nextElementSibling;
    }

    if (!cursor) {
      console.error("No more comments found.");
      return;
    }

    cursor.style.backgroundColor = "yellow";
    cursor.scrollIntoView();
    count++;
    cnt_comment++;
  }

  // function to analyze the comment using OpenAI API
  async function analyzeComment(commentContent, model) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ commentContent, model }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else if (response.error) {
          reject(response.error);
        } else {
          resolve(response.suggestedResponse);
        }
      });
    });
  }

  // function to reply to the comment
  async function reply() {
    if (stopFlag) return;
    try {
      const replyBtn = cursor.querySelector(SELECTORS.replyButton);
      if (!replyBtn) {
        console.error("Reply button not found.");
        return;
      }

      replyBtn.click();
      await delay(period / 2);

      const commentBox = cursor.querySelector(SELECTORS.commentBox);
      if (!commentBox) {
        console.error("Comment box not found.");
        return;
      }

      const commentItemMainContent = cursor.querySelector(SELECTORS.commentItemMainContent)?.innerText;
      const commentContent = `${prompt}\n\n${commentItemMainContent}`;
      const suggestedResponse = await analyzeComment(commentContent, model);

      commentBox.textContent = suggestedResponse.replace(/response:/gi, '').trim();
      const submitButton = cursor.querySelector(SELECTORS.submitButton) ||
        cursor.querySelector(SELECTORS.artdecoButton);

      if (submitButton) {
        submitButton.click();
      }

      await delay(period);
      await next();
      await loadMore();
      await reply();
    } catch (error) {
      console.error("Error during reply:", error);
    }
  }

  // function to add a delay
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // function to load more comments if available
  async function loadMore() {
    const loadMoreButton = document.querySelector(SELECTORS.loadMoreButton);
    if (loadMoreButton) {
      loadMoreButton.click();
      await delay(3000);
    } else {
      console.log("No 'load more comment' button found.");
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "stopAutoReply") {
      stopFlag = true;
      sendResponse({ status: "Auto-reply stopped" });
    }
  });

  // start the reply process
  await next();
  await reply();
}


// Event listener for the start/stop button
document.getElementById("toggleAutoComment").addEventListener("click", async () => {
  const button = document.getElementById("toggleAutoComment");
  const state = button.getAttribute("data-state");

  if (state === "start") {
    await startAutoComment();
  } else {
    stopAutoComment();
  }
});


// function to return the SVG for the start button
function startSvg() {
  return `
    <svg width="20px" height="20px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M16.6582 9.28638C18.098 10.1862 18.8178 10.6361 19.0647 11.2122C19.2803 11.7152 19.2803 12.2847 19.0647 12.7878C18.8178 13.3638 18.098 13.8137 16.6582 14.7136L9.896 18.94C8.29805 19.9387 7.49907 20.4381 6.83973 20.385C6.26501 20.3388 5.73818 20.0469 5.3944 19.584C5 19.053 5 18.1108 5 16.2264V7.77357C5 5.88919 5 4.94701 5.3944 4.41598C5.73818 3.9531 6.26501 3.66111 6.83973 3.6149C7.49907 3.5619 8.29805 4.06126 9.896 5.05998L16.6582 9.28638Z" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"></path> </g></svg> Start Auto-Comment
  `;
}

// function to return the SVG for the stop button
function stopSvg() {
  return `
    <svg width="20px" height="20px"  viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path d="M15.7076 9C15.6314 8.84322 15.5353 8.70688 15.4142 8.58579C14.8284 8 13.8856 8 12 8C10.1144 8 9.17157 8 8.58579 8.58579C8 9.17157 8 10.1144 8 12C8 13.8856 8 14.8284 8.58579 15.4142C9.17157 16 10.1144 16 12 16C13.8856 16 14.8284 16 15.4142 15.4142C15.8858 14.9427 15.9777 14.2398 15.9957 13" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> <path d="M7 3.33782C8.47087 2.48697 10.1786 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 10.1786 2.48697 8.47087 3.33782 7" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"></path> </g></svg> Stop Auto-Comment
  `;
}