import DOMPurify from "isomorphic-dompurify";

const EMAIL_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "center",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
] as const;

const EMAIL_ALLOWED_ATTR = [
  "align",
  "alt",
  "bgcolor",
  "border",
  "cellpadding",
  "cellspacing",
  "colspan",
  "height",
  "href",
  "rel",
  "rowspan",
  "src",
  "style",
  "target",
  "valign",
  "width",
];

const EMAIL_SAFE_STYLE_PROPERTIES = new Set([
  "background",
  "background-color",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-spacing",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "border-width",
  "color",
  "display",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-width",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "vertical-align",
  "white-space",
  "width",
]);

function isSafeStyleValue(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  if (
    normalizedValue.includes("expression(") ||
    normalizedValue.includes("javascript:") ||
    normalizedValue.includes("vbscript:") ||
    normalizedValue.includes("behavior:") ||
    normalizedValue.includes("@import") ||
    normalizedValue.includes("position:fixed") ||
    normalizedValue.includes("position: fixed") ||
    normalizedValue.includes("url(")
  ) {
    return false;
  }

  return true;
}

function sanitizeEmailStyle(styleValue: string | null | undefined) {
  if (!styleValue) {
    return "";
  }

  return styleValue
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const colonIndex = declaration.indexOf(":");
      if (colonIndex === -1) {
        return null;
      }

      const property = declaration.slice(0, colonIndex).trim().toLowerCase();
      const value = declaration.slice(colonIndex + 1).trim();

      if (!EMAIL_SAFE_STYLE_PROPERTIES.has(property) || !isSafeStyleValue(value)) {
        return null;
      }

      return `${property}: ${value}`;
    })
    .filter((declaration): declaration is string => Boolean(declaration))
    .join("; ");
}

function appendStyle(
  existingStyle: string | null,
  property: string,
  value: string,
) {
  const normalizedExisting = sanitizeEmailStyle(existingStyle);
  const propertyPrefix = `${property}:`;

  if (
    normalizedExisting
      .split(";")
      .map((entry) => entry.trim().toLowerCase())
      .some((entry) => entry.startsWith(propertyPrefix))
  ) {
    return normalizedExisting;
  }

  return [normalizedExisting, `${property}: ${value}`]
    .filter(Boolean)
    .join("; ");
}

export function sanitizeEmailHtml(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style") {
      data.attrValue = sanitizeEmailStyle(data.attrValue);
      data.keepAttr = data.attrValue.length > 0;
    }
  });

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const element = node as Element;
    const tagName = element.tagName?.toLowerCase();

    if (tagName === "img") {
      const width = element.getAttribute("width");
      const height = element.getAttribute("height");
      let style = element.getAttribute("style");

      style = appendStyle(style, "max-width", "100%");

      if (!height) {
        style = appendStyle(style, "height", "auto");
      }

      if (width || element.getAttribute("align")) {
        style = appendStyle(style, "display", "block");
      }

      if (style) {
        element.setAttribute("style", style);
      }
    }
  });

  try {
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: [...EMAIL_ALLOWED_TAGS],
      ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
      FORBID_TAGS: ["script", "style"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseenter"],
    });
  } finally {
    DOMPurify.removeAllHooks();
  }
}
