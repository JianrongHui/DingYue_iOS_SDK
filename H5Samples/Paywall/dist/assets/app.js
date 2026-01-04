(() => {
  "use strict";

  const state = {
    payload: null,
    products: [],
    selected_product_id: null,
    is_ready: false,
    pending_payload: null,
  };

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
      {
        platformProductId: "com.sample.yearly",
        price: "49.99",
        currency: "USD",
        period: "YEAR",
        type: "SUBSCRIPTION",
        name: "Yearly",
      },
    ],
    extra: { campaign: "sample" },
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

  function formatProductLabel(product) {
    const name = product.name || "Untitled";
    const price = product.price || "--";
    const currency = product.currency || "";
    const period = product.period || "";
    return `${name} ${price} ${currency} ${period}`.trim();
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

  function renderProducts() {
    elements.products.innerHTML = "";
    if (!state.products.length) {
      const empty = document.createElement("div");
      empty.className = "summary";
      empty.textContent = "No products in payload.";
      elements.products.appendChild(empty);
      return;
    }

    state.products.forEach((product) => {
      const productId = getProductId(product);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `card${
        productId === state.selected_product_id ? " selected" : ""
      }`;

      const title = document.createElement("div");
      title.textContent = product.name || "Unnamed";

      const subtitle = document.createElement("small");
      subtitle.textContent = formatProductLabel(product);

      const meta = document.createElement("small");
      meta.textContent = productId || "missing product id";

      card.appendChild(title);
      card.appendChild(subtitle);
      card.appendChild(meta);

      card.addEventListener("click", () => {
        state.selected_product_id = productId;
        renderProducts();
        setStatus(`selected ${productId || "unknown"}`);
      });

      elements.products.appendChild(card);
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
      [
        "selected_product_id",
        state.selected_product_id ? state.selected_product_id : "none",
      ],
      [
        "auto_close_on_success",
        payload.page_options &&
        payload.page_options.auto_close_on_success !== undefined
          ? String(payload.page_options.auto_close_on_success)
          : "n/a",
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
    renderProducts();
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

  function buildChoosePayload() {
    const productId = state.selected_product_id || "";
    // Include camelCase for native bridge compatibility.
    return {
      product_id: productId,
      productId: productId,
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
    elements.products = document.getElementById("products");
    elements.payload = document.getElementById("payload");
    elements.payloadSummary = document.getElementById("payload-summary");
    elements.status = document.getElementById("status");

    document.getElementById("btn-close").addEventListener("click", () => {
      sendMessage("vip_close", {});
    });

    document.getElementById("btn-restore").addEventListener("click", () => {
      sendMessage("vip_restore", {});
    });

    document.getElementById("btn-terms").addEventListener("click", () => {
      sendMessage("vip_terms", {});
    });

    document.getElementById("btn-privacy").addEventListener("click", () => {
      sendMessage("vip_privacy", {});
    });

    document.getElementById("btn-purchase").addEventListener("click", () => {
      sendMessage("vip_purchase", buildPurchasePayload());
    });

    document.getElementById("btn-choose").addEventListener("click", () => {
      sendMessage("vip_choose", buildChoosePayload());
    });

    document.getElementById("btn-options").addEventListener("click", () => {
      sendMessage("vip_page_options", {
        auto_close_on_success: false,
        auto_close_on_restore: false,
      });
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
