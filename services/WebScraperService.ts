export async function fetchUrlContent(url: string): Promise<string> {
    try {
        console.log(`Fetching content from: ${url}`);

        // Try direct fetch first
        let response = await fetch(url);

        // If opaque or failed on web (likely CORS), try proxy
        if (!response.ok && typeof window !== 'undefined') { // Check if Web
            console.warn("Direct fetch failed, trying CORS proxy...");
            const proxyUrl = 'https://cors-anywhere.herokuapp.com/' + url;
            response = await fetch(proxyUrl);
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        // If html is too short or empty, might be opaque response issue
        if (html.length < 50) {
            throw new Error("Content too short or CORS blocked.");
        }

        return cleanHtml(html);
    } catch (error) {
        console.error("WebScraperService Error:", error);
        throw error;
    }
}

/**
 * Removes script, style, and HTML tags to extract readable text.
 * This is a basic implementation to reduce token usage for AI.
 */
function cleanHtml(html: string): string {
    // 1. Remove script and style tags and their content
    let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, " ");
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, " ");

    // 2. Remove HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // 3. Decode HTML entities (basic ones)
    text = text.replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');

    // 4. Collapse whitespace
    text = text.replace(/\s+/g, " ").trim();

    return text.substring(0, 10000); // Limit to 10k chars to avoid token limits
}
