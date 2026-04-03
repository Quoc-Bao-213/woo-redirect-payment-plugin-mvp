// auxVault.js - All fields as iframes for complete PCI isolation
(() => {
  // ============================================
  // DYNAMIC AMOUNT CAPTURE
  // ============================================
  // Captures amount from URL, POST (via storage), or hash
  function captureExternalAmount() {
    // Priority 1: URL parameters (e.g., test.html?amount=10.58)
    const urlParams = new URLSearchParams(window.location.search);
    let amount =
      urlParams.get("amount") ||
      urlParams.get("total") ||
      urlParams.get("price");
    if (amount) {
      console.log("[AuxVault] Amount captured from URL:", amount);
      return { amount: parseFloat(amount), source: "URL" };
    }

    // Priority 2: Session storage (for POST-like behavior)
    amount =
      sessionStorage.getItem("auxvault_amount") ||
      sessionStorage.getItem("checkout_amount") ||
      sessionStorage.getItem("post_amount");
    if (amount) {
      console.log("[AuxVault] Amount captured from sessionStorage:", amount);
      sessionStorage.removeItem("auxvault_amount"); // Clean up
      sessionStorage.removeItem("checkout_amount");
      sessionStorage.removeItem("post_amount");
      return { amount: parseFloat(amount), source: "POST/Storage" };
    }

    // Priority 3: Local storage (persistent)
    amount =
      localStorage.getItem("auxvault_amount") ||
      localStorage.getItem("checkout_amount");
    if (amount) {
      console.log("[AuxVault] Amount captured from localStorage:", amount);
      return { amount: parseFloat(amount), source: "LocalStorage" };
    }

    // Priority 4: Hash/fragment (e.g., test.html#amount=10.58)
    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      amount = hashParams.get("amount");
      if (amount) {
        console.log("[AuxVault] Amount captured from hash:", amount);
        return { amount: parseFloat(amount), source: "Hash" };
      }
    }

    // Priority 5: Data attribute on script tag
    const scripts = document.querySelectorAll('script[src*="auxVault"]');
    for (let script of scripts) {
      amount = script.dataset.amount;
      if (amount) {
        console.log(
          "[AuxVault] Amount captured from script data attribute:",
          amount,
        );
        return { amount: parseFloat(amount), source: "Script" };
      }
    }

    return null; // No external amount found
  }

  const SUPPORTED_FIELDS = [
    "card", // Unified card field (number + expiry + cvv)
    "cardNumber",
    "cardExpiry",
    "cardCvv", // Separate card fields
    "name",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "postal",
    "country",
    "amount",
  ];

  const FIELD_MAPPING = {
    card: "Card", // Unified field
    cardNumber: "CardNumber",
    cardExpiry: "ExpiryDate",
    cardCvv: "Cvv",
    name: "BillingCustomerName",
    email: "BillingEmail",
    phone: "BillingPhoneNumber",
    address: "BillingAddress",
    city: "BillingCity",
    state: "BillingState",
    postal: "BillingPostalCode",
    country: "BillingCountry",
    amount: "Amount",
  };

  const CDN_BASE = "https://vault.auxvault.net/v1";

  class AuxVaultSDK {
    constructor(apiKey, opts = {}) {
      this.apiKey = apiKey;
      this.endpoint =
        opts.endpoint ||
        "https://dev-api.auxvault.net/api/v1/public/transaction";
      // Default to PCI Level 1 CDN hosting
      this.vaultFile = opts.vaultFile || `${CDN_BASE}/auxvault-field.html`;
      this.vaultCardFile =
        opts.vaultCardFile || `${CDN_BASE}/auxvault-card-unified.html`;
      this.elements = new Map();
      this.sessionId = `auxvault_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.version = "3.2.2";
      // Capture merchant origin for domain-bound key validation
      // Can be overridden via opts.merchantOrigin for testing
      if (opts.merchantOrigin) {
        this.merchantOrigin = opts.merchantOrigin;
        console.log(
          "[AuxVault] Using override merchantOrigin:",
          this.merchantOrigin,
        );
      } else {
        const origin = window.location.origin;
        const protocol = window.location.protocol;
        console.log("[AuxVault] Detecting origin:", {
          origin,
          protocol,
          href: window.location.href,
        });

        // Check for file:// protocol or null origin
        if (
          protocol === "file:" ||
          origin === "null" ||
          origin === null ||
          !origin
        ) {
          // file:// protocol - use directory path as fallback
          this.merchantOrigin =
            window.location.href.split("/").slice(0, -1).join("/") ||
            "file://local";
          console.warn(
            "[AuxVault] Running from file:// protocol. merchantOrigin:",
            this.merchantOrigin,
          );
        } else {
          this.merchantOrigin = origin;
          console.log("[AuxVault] merchantOrigin set to:", this.merchantOrigin);
        }
      }
    }

    createElement(type, opts = {}) {
      if (!SUPPORTED_FIELDS.includes(type)) {
        throw new Error(
          `Unsupported field type: ${type}. Supported: ${SUPPORTED_FIELDS.join(", ")}`,
        );
      }

      const iframe = document.createElement("iframe");
      // Use unified card file for 'card' type, regular field file for others
      iframe.src = type === "card" ? this.vaultCardFile : this.vaultFile;
      iframe.allow = "payment";
      iframe.style.border = "0";
      iframe.style.width = opts.width || "100%";
      // Unified card field uses same height as other fields
      iframe.style.height = opts.height || "44px";
      iframe.style.display = "block";
      iframe.setAttribute("data-auxvault-field", type);
      iframe.setAttribute("scrolling", "no");

      const listeners = new Map();
      let readyFired = false;
      const fieldId = `${this.sessionId}_${type}`;

      const element = {
        _iframe: iframe,
        _type: type,
        _fieldId: fieldId,
        _ready: false,

        mount(sel) {
          const target =
            typeof sel === "string" ? document.querySelector(sel) : sel;
          if (!target) throw new Error("Mount target not found");
          target.innerHTML = "";
          target.appendChild(iframe);

          window.addEventListener("message", (e) => {
            const d = e.data;
            if (!d || d.source !== "auxvault-field") return;
            if (d.fieldType !== type) return;

            if (d.type === "ready") {
              readyFired = true;
              element._ready = true;
            }

            const cb = listeners.get(d.type);
            if (cb) cb(d.payload);
          });

          // Send configuration to iframe after it loads
          iframe.onload = () => {
            setTimeout(() => {
              iframe.contentWindow?.postMessage(
                {
                  source: "auxvault-parent",
                  type: "configure",
                  fieldId,
                  fieldType: type,
                },
                "*",
              );
            }, 50);
          };
        },

        on(ev, cb) {
          if (ev === "ready" && readyFired) {
            setTimeout(() => cb({}), 0);
            return;
          }
          listeners.set(ev, cb);
        },

        setValue(value) {
          iframe.contentWindow?.postMessage(
            {
              source: "auxvault-parent",
              type: "setValue",
              value,
            },
            "*",
          );
        },

        setReadonly(readonly) {
          iframe.contentWindow?.postMessage(
            {
              source: "auxvault-parent",
              type: "setReadonly",
              readonly,
            },
            "*",
          );
        },

        getValue() {
          return new Promise((resolve, reject) => {
            const requestId = `get_${Math.random().toString(36).slice(2)}`;
            const onMsg = (e) => {
              const d = e.data;
              if (
                !d ||
                d.source !== "auxvault-field" ||
                d.requestId !== requestId
              )
                return;
              window.removeEventListener("message", onMsg);
              if (d.type === "value") resolve(d.value);
              else reject(new Error("Failed to get value"));
            };
            window.addEventListener("message", onMsg);
            iframe.contentWindow?.postMessage(
              {
                source: "auxvault-parent",
                type: "getValue",
                requestId,
              },
              "*",
            );
            setTimeout(() => {
              window.removeEventListener("message", onMsg);
              reject(new Error("Timeout getting value"));
            }, 5000);
          });
        },
      };

      this.elements.set(type, element);
      return element;
    }

    async createTransaction(additionalParams = {}) {
      // Collect values from all mounted fields
      const values = {};

      try {
        for (const [type, element] of this.elements.entries()) {
          if (!element._ready) {
            console.warn(`Field ${type} not ready, skipping...`);
            continue;
          }
          values[type] = await element.getValue();
        }
      } catch (error) {
        throw new Error("Failed to collect field data: " + error.message);
      }

      // Handle unified card field - extract individual values
      if (values.card && typeof values.card === "object") {
        values.cardNumber = values.card.cardNumber || "";
        values.cardExpiry = values.card.cardExpiry || "";
        values.cardCvv = values.card.cardCvv || "";
      }

      // Handle country field - extract country name and billing code
      let countryName = "USA";
      let countryCode = "+1";
      if (values.country) {
        if (typeof values.country === "object") {
          // New format: object with code, name, and billingCode
          countryName = values.country.name || "USA";
          countryCode = values.country.billingCode || "+1";
        } else {
          // Old format: just a string
          countryName = values.country;
        }
      }

      // Build transaction payload using field mapping
      const requestPayload = {
        Amount: parseFloat(values.amount) || additionalParams.amount || 0,
        CardNumber: (values.cardNumber || "").replace(/\s/g, ""),
        ExpiryDate: values.cardExpiry || "",
        Cvv: values.cardCvv || "",
        BillingCustomerName: values.name || additionalParams.billingName || "",
        BillingEmail: values.email || additionalParams.billingEmail || "",
        BillingPhoneNumber: values.phone || additionalParams.billingPhone || "",
        BillingAddress: values.address || additionalParams.billingAddress || "",
        BillingCity: values.city || additionalParams.billingCity || "",
        BillingState: values.state || additionalParams.billingState || "",
        BillingPostalCode:
          values.postal || additionalParams.billingPostal || "",
        BillingCountry: countryName || additionalParams.billingCountry || "USA",
        BillingCountryCode:
          countryCode || additionalParams.billingCountryCode || "+1",
        ShippingSameAsBilling: additionalParams.shippingSameAsBilling !== false,
        ShippingCustomerName: additionalParams.shippingName || "",
        ShippingEmail: additionalParams.shippingEmail || "",
        ShippingPhoneNumber: additionalParams.shippingPhone || "",
        ShippingAddress: additionalParams.shippingAddress || "",
        ShippingCity: additionalParams.shippingCity || "",
        ShippingState: additionalParams.shippingState || "",
        ShippingPostalCode: additionalParams.shippingPostal || "",
        ShippingCountry: additionalParams.shippingCountry || "",
        SuggestedMode: additionalParams.suggestedMode || "Card",
        ConvenienceFeeActive: additionalParams.convenienceFeeActive !== false,
        TransactionType: additionalParams.transactionType || "1",
        PaymentTokenization: additionalParams.paymentTokenization !== false,
        IpAddress: additionalParams.ipAddress || "0.0.0.0",
      };

      // Validate required fields
      if (!requestPayload.CardNumber)
        throw new Error("Card number is required");
      if (!requestPayload.ExpiryDate)
        throw new Error("Expiry date is required");
      if (!requestPayload.Cvv) throw new Error("CVV is required");

      // Make API call
      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: this.apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Merchant-Origin": this.merchantOrigin,
          },
          body: JSON.stringify(requestPayload),
        });

        const data = await response.json();

        if (response.ok) {
          // Clear fields on success
          for (const element of this.elements.values()) {
            element._iframe.contentWindow?.postMessage(
              {
                source: "auxvault-parent",
                type: "clear",
              },
              "*",
            );
          }
          return {
            success: true,
            response: data,
            _debug: {
              merchantOrigin: this.merchantOrigin,
              headersSent: {
                Authorization: this.apiKey.substring(0, 10) + "...",
                "X-Merchant-Origin": this.merchantOrigin,
              },
            },
          };
        } else {
          const error = new Error(data.message || "Transaction failed");
          error._debug = {
            merchantOrigin: this.merchantOrigin,
            headersSent: {
              Authorization: this.apiKey.substring(0, 10) + "...",
              "X-Merchant-Origin": this.merchantOrigin,
            },
          };
          throw error;
        }
      } catch (error) {
        error._debug = error._debug || {
          merchantOrigin: this.merchantOrigin,
          headersSent: {
            Authorization: this.apiKey.substring(0, 10) + "...",
            "X-Merchant-Origin": this.merchantOrigin,
          },
        };
        throw error;
      }
    }
  }

  window.AuxVault = function (apiKey, opts) {
    return new AuxVaultSDK(apiKey, opts);
  };

  // Auto-initialization from script tag data attributes
  function autoInit() {
    // Find the script tag that loaded this file
    const scripts = document.querySelectorAll('script[src*="auxVault"]');
    let script = null;

    // Find the one with data-auto-init
    for (let s of scripts) {
      if (s.dataset.autoInit === "true") {
        script = s;
        break;
      }
    }

    if (!script) return;

    const apiKey = script.dataset.apiKey;
    const endpoint =
      script.dataset.endpoint ||
      "https://sandbox-api.auxvault.net/api/v1/public/transaction";
    const vaultFile = script.dataset.vaultFile || "auxvault-field.html";
    const vaultCardFile =
      script.dataset.vaultCardFile || "auxvault-card-unified.html";
    const defaultAmount = script.dataset.defaultAmount;
    const successUrl = script.dataset.successUrl || ""; // Redirect URL after transaction completion
    const merchantOrigin = script.dataset.merchantOrigin || ""; // Optional override

    if (!apiKey) {
      console.error("AuxVault: data-api-key required for auto-init");
      return;
    }

    // Debug logging for origin detection
    console.log("[AuxVault] autoInit debug:", {
      "window.location.origin": window.location.origin,
      "window.location.href": window.location.href,
      "window.location.protocol": window.location.protocol,
      "script.dataset.merchantOrigin": script.dataset.merchantOrigin,
      "merchantOrigin variable": merchantOrigin,
      "script attributes": Array.from(script.attributes).map(
        (a) => a.name + "=" + a.value,
      ),
    });

    const auxvault = new AuxVaultSDK(apiKey, {
      endpoint,
      vaultFile,
      vaultCardFile,
      merchantOrigin,
    });

    // Auto-mount fields based on data-auxvault attribute
    const mountedFields = [];
    document.querySelectorAll("[data-auxvault]").forEach((el) => {
      const fieldType = el.dataset.auxvault;
      if (SUPPORTED_FIELDS.includes(fieldType)) {
        auxvault.createElement(fieldType).mount(el);
        mountedFields.push(fieldType);
      }
    });

    // ============================================
    // CAPTURE EXTERNAL AMOUNT AND MAKE READONLY
    // ============================================
    const externalAmount = captureExternalAmount();
    let finalAmount = defaultAmount; // Start with script tag amount
    let amountSource = "default";

    if (externalAmount) {
      // External amount takes priority over script tag amount
      finalAmount = externalAmount.amount.toFixed(2);
      amountSource = externalAmount.source;

      console.log(
        "[AuxVault] Using external amount:",
        finalAmount,
        "from",
        amountSource,
      );

      // Set amount and make readonly
      setTimeout(() => {
        const amountElement = auxvault.elements.get("amount");
        if (amountElement) {
          amountElement.setValue(finalAmount);
          amountElement.setReadonly(true);

          // Add visual indicator on the container
          // const amountContainer = document.querySelector('[data-auxvault="amount"]');
          // if (amountContainer) {
          //   amountContainer.setAttribute('data-amount-source', amountSource);
          //   amountContainer.style.position = 'relative';

          //   // Add a small badge/indicator
          //   const badge = document.createElement('div');
          //   badge.style.cssText = `
          //     position: absolute;
          //     top: -8px;
          //     right: -8px;
          //     background: #10b981;
          //     color: white;
          //     font-size: 10px;
          //     padding: 2px 6px;
          //     border-radius: 10px;
          //     font-weight: bold;
          //     z-index: 10;
          //     pointer-events: none;
          //   `;
          //  badge.textContent = '\u{1F512} ' + amountSource;
          //   badge.title = 'Amount set from ' + amountSource;
          //   amountContainer.appendChild(badge);
          // }
        }
      }, 1500);
    } else if (defaultAmount) {
      // No external amount, use script tag default amount
      setTimeout(() => {
        auxvault.elements.get("amount")?.setValue(defaultAmount);
      }, 1500);
    }

    // Store the captured amount info for transaction use
    auxvault._externalAmount = externalAmount;

    // Smart defaults for missing fields
    const FIELD_DEFAULTS = {
      name: "AuxVault Customer",
      email: "customer@auxvault.net",
      phone: "555-555-5555",
      address: "123 Main Street",
      city: "Anytown",
      state: "CA",
      postal: "12345",
      country: "USA",
      amount: "10.00",
    };

    // Auto-bind payment button
    const payButton = document.querySelector('[data-auxvault-button="pay"]');
    const resultDiv = document.querySelector("[data-auxvault-result]");
    const diagnosticsDiv = document.querySelector(
      "[data-auxvault-diagnostics]",
    );
    const showDiagnostics = script.dataset.diagnostics === "true";

    if (payButton) {
      payButton.onclick = async () => {
        if (resultDiv) {
          resultDiv.textContent = "Processing...";
          resultDiv.className = "";
          resultDiv.style.display = "block";
        }

        const startTime = Date.now();

        try {
          // Build billing data - use defaults for any field not mounted
          const billingData = {
            billingName: mountedFields.includes("name")
              ? undefined
              : FIELD_DEFAULTS.name,
            billingEmail: mountedFields.includes("email")
              ? undefined
              : FIELD_DEFAULTS.email,
            billingPhone: mountedFields.includes("phone")
              ? undefined
              : FIELD_DEFAULTS.phone,
            billingAddress: mountedFields.includes("address")
              ? undefined
              : FIELD_DEFAULTS.address,
            billingCity: mountedFields.includes("city")
              ? undefined
              : FIELD_DEFAULTS.city,
            billingState: mountedFields.includes("state")
              ? undefined
              : FIELD_DEFAULTS.state,
            billingPostal: mountedFields.includes("postal")
              ? undefined
              : FIELD_DEFAULTS.postal,
            billingCountry: mountedFields.includes("country")
              ? undefined
              : FIELD_DEFAULTS.country,
            amount: mountedFields.includes("amount")
              ? undefined
              : parseFloat(FIELD_DEFAULTS.amount),
          };

          const res = await auxvault.createTransaction(billingData);
          const endTime = Date.now();

          // Extract transaction details
          const txnId =
            res.response?.TransactionId ||
            res.response?.transactionId ||
            res.response?.data?.TransactionId ||
            "N/A";
          const status =
            res.response?.Status ||
            res.response?.status ||
            res.response?.data?.Status ||
            "unknown";
          const amount =
            res.response?.Amount ||
            res.response?.amount ||
            res.response?.data?.Amount ||
            "N/A";
          const responseText =
            res.response?.data?.ResponseText ||
            res.response?.ResponseText ||
            "";

          // Check if transaction actually succeeded (status should not be 9 which is error, or 'error' string)
          const isError =
            status === "error" ||
            status === 9 ||
            res.response?.status === "error";

          if (resultDiv) {
            if (isError) {
              // Show error message
              const errorMessage =
                res.response?.message || "Transaction failed";
              resultDiv.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 8px;">&#x274C; Payment Failed</div>
                <div style="font-size: 13px;">
                  Transaction ID: <strong>${txnId}</strong><br>
                  Amount: <strong>$${amount}</strong><br>
                  Status: <strong>${status}</strong><br>
                  ${errorMessage ? `Error: <strong>${errorMessage}</strong><br>` : ""}
                  ${responseText ? `Response: <strong>${responseText}</strong><br>` : ""}
                  Time: <strong>${endTime - startTime}ms</strong>
                </div>
              `;
              resultDiv.className = "error";

              // Redirect on failed transaction if URL is provided
              if (successUrl) {
                setTimeout(() => {
                  try {
                    const url = new URL(successUrl, window.location.origin);
                    url.searchParams.set("result", "fail");
                    if (txnId && txnId !== "N/A")
                      url.searchParams.set("transactionId", txnId);
                    url.searchParams.set("status", status);
                    if (errorMessage)
                      url.searchParams.set("message", errorMessage);
                    window.location.href = url.toString();
                  } catch (e) {
                    console.error("Error building fail URL:", e);
                    window.location.href = successUrl;
                  }
                }, 1200);
              }
            } else {
              // Show success message
              resultDiv.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 8px;">&#x2705; Payment Approved</div>
                <div style="font-size: 13px;">
                  Transaction ID: <strong>${txnId}</strong><br>
                  Amount: <strong>$${amount}</strong><br>
                  Status: <strong>${status}</strong><br>
                  Time: <strong>${endTime - startTime}ms</strong>
                </div>
              `;
              resultDiv.className = "success";

              // Redirect on success if URL is provided
              if (successUrl) {
                setTimeout(async () => {
                  try {
                    // Build URL with transaction details
                    const url = new URL(successUrl, window.location.origin);

                    // Add transaction details
                    url.searchParams.set("result", "success");
                    url.searchParams.set("transactionId", txnId);
                    url.searchParams.set("amount", amount);
                    url.searchParams.set("status", status);
                    url.searchParams.set("timestamp", new Date().toISOString());

                    // Collect field values for customer info
                    for (const [type, element] of auxvault.elements.entries()) {
                      if (
                        element._ready &&
                        [
                          "name",
                          "email",
                          "phone",
                          "address",
                          "city",
                          "state",
                          "postal",
                          "country",
                        ].includes(type)
                      ) {
                        try {
                          const value = await element.getValue();
                          if (value) url.searchParams.set(type, value);
                        } catch (e) {
                          // Skip if can't get value
                        }
                      }
                    }

                    // Add defaults if not from fields
                    if (
                      !url.searchParams.has("name") &&
                      billingData.billingName
                    ) {
                      url.searchParams.set("name", billingData.billingName);
                    }
                    if (
                      !url.searchParams.has("email") &&
                      billingData.billingEmail
                    ) {
                      url.searchParams.set("email", billingData.billingEmail);
                    }
                    if (
                      !url.searchParams.has("phone") &&
                      billingData.billingPhone
                    ) {
                      url.searchParams.set("phone", billingData.billingPhone);
                    }

                    window.location.href = url.toString();
                  } catch (e) {
                    console.error("Error building success URL:", e);
                    window.location.href = successUrl;
                  }
                }, 1200); // Brief delay so user can see the result message
              }
            }
          }

          // Show diagnostics if enabled
          if (showDiagnostics && diagnosticsDiv) {
            diagnosticsDiv.style.display = "block";
            diagnosticsDiv.innerHTML = `
              <h3 style="margin: 20px 0 10px 0; color: #2c3e50;">&#x1F50D; Diagnostics</h3>
              
              <h4 style="margin: 15px 0 8px 0; color: #10b981;">&#x2713; Headers Sent to API:</h4>
              <pre style="background: #e8f5e9; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #81c784;">${JSON.stringify(res._debug || { merchantOrigin: "N/A" }, null, 2)}</pre>
              
              <h4 style="margin: 15px 0 8px 0; color: #555;">Request Payload:</h4>
              <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #ddd;">${JSON.stringify(billingData, null, 2)}</pre>
              
              <h4 style="margin: 15px 0 8px 0; color: #555;">API Response:</h4>
              <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #ddd;">${JSON.stringify(res.response, null, 2)}</pre>
              
              <h4 style="margin: 15px 0 8px 0; color: #555;">Mounted Fields:</h4>
              <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #ddd;">${JSON.stringify(mountedFields, null, 2)}</pre>
            `;
          }
        } catch (error) {
          const endTime = Date.now();

          if (resultDiv) {
            resultDiv.innerHTML = `
              <div style="font-weight: 600; margin-bottom: 8px;">&#x274C; Payment Failed</div>
              <div style="font-size: 13px;">
                Error: <strong>${error.message}</strong><br>
                Time: <strong>${endTime - startTime}ms</strong>
              </div>
            `;
            resultDiv.className = "error";
          }

          // Redirect on processing error if URL is provided
          if (successUrl) {
            setTimeout(() => {
              try {
                const url = new URL(successUrl, window.location.origin);
                url.searchParams.set("result", "fail");
                url.searchParams.set(
                  "message",
                  error.message || "Transaction failed",
                );
                window.location.href = url.toString();
              } catch (e) {
                console.error("Error building fail URL:", e);
                window.location.href = successUrl;
              }
            }, 1200);
          }

          // Show error diagnostics if enabled
          if (showDiagnostics && diagnosticsDiv) {
            diagnosticsDiv.style.display = "block";
            diagnosticsDiv.innerHTML = `
              <h3 style="margin: 20px 0 10px 0; color: #c62828;">&#x26A0; Error Diagnostics</h3>
              
              <h4 style="margin: 15px 0 8px 0; color: #10b981;">&#x2713; Headers Sent to API:</h4>
              <pre style="background: #e8f5e9; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #81c784;">${JSON.stringify(error._debug || { merchantOrigin: auxvault.merchantOrigin, note: "Headers were sent" }, null, 2)}</pre>
              
              <h4 style="margin: 15px 0 8px 0; color: #555;">Error Details:</h4>
              <pre style="background: #ffebee; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #ef5350; color: #c62828;">${error.message}\n\n${error.stack || ""}</pre>
              
              <h4 style="margin: 15px 0 8px 0; color: #555;">Attempted Request:</h4>
              <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; border: 1px solid #ddd;">${JSON.stringify(billingData, null, 2)}</pre>
            `;
          }
        }
      };
    }

    // Expose globally for programmatic access if needed
    window.auxvaultInstance = auxvault;

    // Add global message listener to relay country changes between iframes
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (
        d &&
        d.source === "auxvault-field-country" &&
        d.type === "countryChange"
      ) {
        console.log("Country change detected:", d.country);
        // Relay country change to all other field iframes
        for (const [type, element] of auxvault.elements.entries()) {
          if (
            element._ready &&
            element._iframe &&
            element._iframe.contentWindow
          ) {
            element._iframe.contentWindow.postMessage(
              {
                source: "auxvault-field-country",
                type: "countryChange",
                country: d.country,
              },
              "*",
            );
          }
        }
      }
    });
  }

  // Run immediately if DOM ready, otherwise wait
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();
