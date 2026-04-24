# Privacy Policy — Cardmarket Stock Exporter

**Last updated:** 2026-04-24

## Summary

This extension does **not** collect, store, transmit, or share any user data. It operates entirely within your browser.

## What data the extension accesses

The extension accesses only the HTML content of pages on `https://www.cardmarket.com/*` when you explicitly click the extension icon and initiate an export. Specifically, it reads:

- Your own stock listings (card names, quantities, prices, conditions, comments)
- Cardmarket's public expansion metadata

The extension uses your existing browser session cookie (set when you logged into cardmarket.com) to retrieve your own stock pages. Your **username, password, email address, payment information, or personal details are never read, stored, or transmitted.**

## What data the extension collects

**None.** The extension:

- Does not transmit any data to any external server
- Does not include any analytics, tracking pixels, or telemetry
- Does not use cookies beyond the existing cardmarket.com session cookie set by the website itself
- Does not use third-party SDKs or libraries that contact remote servers
- Does not log user behavior

## Where data is stored

The generated CSV file is saved **locally** to your computer's Downloads folder. Nothing leaves your machine.

No data is stored in `chrome.storage`, `localStorage`, `sessionStorage`, `IndexedDB`, or any other persistence mechanism.

## Permissions explained

| Permission | Reason |
|-----------|--------|
| `activeTab` | Access the current tab when you click the icon |
| `tabs` | Locate the Cardmarket stock tab when the popup is pinned to a separate window (only Cardmarket URLs are read) |
| `scripting` | Inject the export script into your Cardmarket tab |
| `downloads` | Save the CSV file to your Downloads folder |
| `host_permissions: cardmarket.com` | Fetch additional stock pages during export |

## Third parties

The extension communicates **only** with `cardmarket.com` (the service you are already using). No third-party servers are contacted.

The donation button in the popup links to `paypal.com` — clicking it opens PayPal in a new tab using standard browser navigation. PayPal's privacy policy applies there, not this extension.

## Changes to this policy

If this policy changes, the updated version will be committed to the GitHub repository and the "Last updated" date above will reflect the change.

## Contact

For privacy questions, open an issue on GitHub:
https://github.com/LUPZN/cardmarket-stock-exporter/issues

## Source code

The extension is open source. You are welcome to review the code at any time:
https://github.com/LUPZN/cardmarket-stock-exporter
