// ==UserScript==
// @name         VS Code VSIX Downloader
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Download VSIX files directly from the Visual Studio Marketplace.
// @author       Shix
// @match        https://marketplace.visualstudio.com/items*
// @grant        none
// ==/UserScript==

// Configuration
const EXTENSION_DATA = {
  version: "",
  publisher: "",
  identifier: "",

  // Builds the direct download URL for the VSIX file
  getDownloadUrl: function () {
    const pub = this.identifier.split(".")[0];
    const ext = this.identifier.split(".")[1];
    return `https://${pub}.gallery.vsassets.io/_apis/public/gallery/publisher/${pub}/extension/${ext}/${this.version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`;
  },

  // Generates the filename to save as
  getFileName: function () {
    return `${this.identifier}-${this.version}.vsix`;
  }
};

/**
 * Extracts metadata like version, publisher, and identifier from the page
 */
function extractMetadata() {
  let foundData = false;

  // Try extracting from the metadata tables
  const tables = document.querySelectorAll(".ux-table-metadata");
  
  tables.forEach((table) => {
    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td, th"); // some tables might use th
      if (cells.length >= 2) {
        const key = cells[0].textContent.toLowerCase().trim();
        const value = cells[1].textContent.trim();
        
        if (key.includes("version")) {
          EXTENSION_DATA.version = value;
          foundData = true;
        } else if (key.includes("publisher")) {
          EXTENSION_DATA.publisher = value;
        } else if (key.includes("identifier")) {
          EXTENSION_DATA.identifier = value;
        }
      }
    });
  });

  // Fallback for identifier if not found in table (extract from URL)
  if (!EXTENSION_DATA.identifier) {
    const urlParams = new URLSearchParams(window.location.search);
    const itemName = urlParams.get("itemName");
    if (itemName) {
      EXTENSION_DATA.identifier = itemName;
      const parts = itemName.split(".");
      EXTENSION_DATA.publisher = parts[0];
    }
  }

  // Debug logging to the console so we can see what was extracted
  console.log("VS Code VSIX Downloader Extracted Data:", JSON.stringify(EXTENSION_DATA));

  return foundData || EXTENSION_DATA.identifier;
}

/**
 * Creates the download button and sets up the click event
 */
function createDownloadButton() {
  const button = document.createElement("button");
  button.innerText = "Download VSIX";
  button.id = "download-vsix-btn";
  
  // Apply initial styles (can be adjusted to match VS Code Marketplace look)
  Object.assign(button.style, {
    backgroundColor: "#0078d4", // Marketplace blue
    color: "#ffffff",
    border: "none",
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    margin: "0 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "32px",
    fontFamily: '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
    transition: "background-color 0.2s ease"
  });

  // Hover effects
  button.addEventListener("mouseover", () => {
    button.style.backgroundColor = "#106ebe";
  });
  button.addEventListener("mouseout", () => {
    button.style.backgroundColor = "#0078d4";
  });

  // Click handler
  button.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!EXTENSION_DATA.version) {
      // If version still missing, try to parse it again in case it loaded late
      extractMetadata();
    }
    
    if (!EXTENSION_DATA.version || !EXTENSION_DATA.identifier) {
      alert("Could not extract extension details. Wait for the page to fully load.");
      return;
    }

    const downloadUrl = EXTENSION_DATA.getDownloadUrl();
    const fileName = EXTENSION_DATA.getFileName();
    
    // Change button state to indicate downloading
    const originalText = button.innerText;
    button.innerText = "Downloading...";
    button.disabled = true;
    button.style.opacity = "0.7";
    button.style.cursor = "wait";

    try {
      // Fetch the file as a blob so we can force the 'download' filename
      // The gallery URL doesn't set Content-Disposition with a filename, and
      // being cross-origin, the standard <a> download attribute is ignored.
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      console.error("VSIX Download Error:", error);
      alert("Failed to download VSIX file. See console for details.");
    } finally {
      // Restore button text/state
      button.innerText = originalText;
      button.disabled = false;
      button.style.opacity = "1";
      button.style.cursor = "pointer";
    }
  });

  return button;
}

/**
 * Injects the button into the page
 */
function injectButton() {
  // Prevent duplicate injections
  if (document.getElementById("download-vsix-btn")) return false;

  // Find the exact Install button
  const installBtn = document.querySelector(".ux-button.install") || document.querySelector(".install-button-container button");
  
  if (installBtn && installBtn.parentNode) {
    const btn = createDownloadButton();
    // Insert immediately after the install button
    installBtn.parentNode.insertBefore(btn, installBtn.nextSibling);
    return true;
  }
  
  return false;
}

// Ensure the page has fully loaded before trying to inject elements
// The marketplace is a SPA, so elements might be dynamically rendered.
function init() {
  const tryInject = () => {
    // Only inject on extension pages
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.get("itemName")) return;

    if (!document.getElementById("download-vsix-btn")) {
      injectButton();
    }
  };

  // Try immediately
  tryInject();

  // The marketplace is a SPA, so elements might be dynamically rendered or re-rendered
  // We use a MutationObserver for instant reaction to DOM changes
  const observer = new MutationObserver(() => {
    tryInject();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Fallback setInterval in case the observer gets detached or misses a deeply nested change
  setInterval(tryInject, 1500);
}

// Start sequence
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
