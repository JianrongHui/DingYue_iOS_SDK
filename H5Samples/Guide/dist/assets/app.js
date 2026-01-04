(() => {
  "use strict";

  const state = {
    payload: null,
    products: [],
    selected_product_id: null,
    current_index: 0,
    is_ready: false,
    pending_payload: null,
  };

  const steps = [
    {
      title: "Personalize",
      description: "Pick a goal and tune the guide pace.",
    },
    {
      title: "Practice",
      description: "Try a short preview with gentle prompts.",
    },
    {
      title: "Stay on track",
      description: "Unlock reminders and premium scenes.",
    },
  ];

  const defaultPayload = {
    system_language: "en-US",
    products: [
      {
        platformProductId: "com.sample.weekly",
        price: "4.99",
        currency: "USD",
        period: "WEEK",
        type: "SUBSCRIPTION",
        name: "Weekly",
      },
      {
        platformProductId: "com.sample.monthly",
        price: "12.99",
        currency: "USD",
        period: "MONTH",
        type: "SUBSCRIPTION",
        name: "Monthly",
      },
    ],
    extra: { campaign: "guide-sample" },
    page_options: { auto_close_on_success: true },
  };

  const elements = {};

  function decodeBase64Payload(base64Payload) {
    if (!base64Payload) {
      return "";
    }
    const normalized = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (window.TextDecoder) {
      return new TextDecoder("utf-8").decode(bytes);
    }
    let output = "";
    for (let i = 0; i < bytes.length; i += 1) {
      output += String.fromCharCode(bytes[i]);
    }
    try {
      return decodeURIComponent(escape(output));
    } catch (error) {
      return output;
    }
  }

  function parsePayloadText(payloadText) {
    if (!payloadText) {
      return null;
    }
    try {
      return JSON.parse(payloadText);
    } catch (error) {
      return null;
    }
  }

  function getProductId(product) {
    if (!product) {
      return "";
    }
    return (
      product.platformProductId ||
      product.platform_product_id ||
      product.product_id ||
      ""
    );
  }

  function setStatus(text) {
    elements.status.textContent = text || "none";
  }

  function setPayload(payload) {
    state.payload = payload;
    state.products = Array.isArray(payload.products) ? payload.products : [];
    if (!state.selected_product_id && state.products.length) {
      state.selected_product_id = getProductId(state.products[0]);
    }
    render();
  }

  function renderSteps() {
    elements.steps.innerHTML = "";
    steps.forEach((step, index) => {
      const card = document.createElement("div");
      card.className = `step-card${
        index === state.current_index ? " active" : ""
      }`;

      const title = document.createElement("div");
      title.textContent = `${index + 1}. ${step.title}`;

      const description = document.createElement("small");
      description.textContent = step.description;

      card.appendChild(title);
      card.appendChild(description);

      elements.steps.appendChild(card);
    });
  }

  function renderSummary() {
    const payload = state.payload || {};
    const summaryRows = [
      [
        "system_language",
        payload.system_language || payload.systemLanguage || "unknown",
      ],
      ["products", String(state.products.length)],
      ["current_index", String(state.current_index)],
      [
        "selected_product_id",
        state.selected_product_id ? state.selected_product_id : "none",
      ],
    ];

    elements.payloadSummary.innerHTML = "";
    summaryRows.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "row";
      const key = document.createElement("span");
      key.textContent = label;
      const val = document.createElement("span");
      val.textContent = value;
      row.appendChild(key);
      row.appendChild(val);
      elements.payloadSummary.appendChild(row);
    });
  }

  function renderPayloadJson() {
    elements.payload.textContent = JSON.stringify(state.payload, null, 2);
  }

  function render() {
    renderSteps();
    renderSummary();
    renderPayloadJson();
  }

  function canUseBridge(name) {
    return (
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers[name]
    );
  }

  function sendMessage(name, payload) {
    setStatus(name);
    if (canUseBridge(name)) {
      window.webkit.messageHandlers[name].postMessage(payload || {});
    } else {
      console.log("Bridge missing for", name, payload || {});
    }
  }

  function buildPurchasePayload() {
    const productId = state.selected_product_id || "";
    // Include camelCase for native bridge compatibility.
    return {
      product_id: productId,
      productId: productId,
    };
  }

  function buildContinuePayload(nextIndex) {
    // Include camelCase for native bridge compatibility.
    return {
      current_index: state.current_index,
      next_index: nextIndex,
      currentIndex: state.current_index,
      nextIndex: nextIndex,
    };
  }

  function handlePayloadText(payloadText) {
    const parsed = parsePayloadText(payloadText);
    if (parsed) {
      setPayload(parsed);
      return;
    }
    setStatus("invalid payload");
  }

  function applyPayloadFromBase64(base64Payload) {
    try {
      const decoded = decodeBase64Payload(base64Payload);
      handlePayloadText(decoded);
    } catch (error) {
      setStatus("payload decode failed");
    }
  }

  window.iostojs = (base64Payload) => {
    state.pending_payload = base64Payload;
    if (!state.is_ready) {
      return;
    }
    applyPayloadFromBase64(base64Payload);
  };

  function init() {
    elements.steps = document.getElementById("steps");
    elements.payload = document.getElementById("payload");
    elements.payloadSummary = document.getElementById("payload-summary");
    elements.status = document.getElementById("status");

    document.getElementById("btn-close").addEventListener("click", () => {
      sendMessage("guide_close", { type: "button" });
    });

    document.getElementById("btn-restore").addEventListener("click", () => {
      sendMessage("guide_restore", {});
    });

    document.getElementById("btn-terms").addEventListener("click", () => {
      sendMessage("guide_terms", {});
    });

    document.getElementById("btn-privacy").addEventListener("click", () => {
      sendMessage("guide_privacy", {});
    });

    document.getElementById("btn-purchase").addEventListener("click", () => {
      sendMessage("guide_purchase", buildPurchasePayload());
    });

    document.getElementById("btn-options").addEventListener("click", () => {
      sendMessage("guide_page_options", {
        auto_close_on_success: false,
        auto_close_on_restore: false,
      });
    });

    document.getElementById("btn-continue").addEventListener("click", () => {
      const nextIndex = Math.min(state.current_index + 1, steps.length - 1);
      sendMessage("guide_continue", buildContinuePayload(nextIndex));
      state.current_index = nextIndex;
      renderSteps();
    });

    state.is_ready = true;
    if (state.pending_payload) {
      applyPayloadFromBase64(state.pending_payload);
    } else {
      setPayload(defaultPayload);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
