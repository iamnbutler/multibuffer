// Long single-line expressions that stress horizontal rendering

export const CSS_RESET = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;border:0;font-size:100%;font:inherit;vertical-align:baseline;text-decoration:none;outline:none;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`;

export const BASE64_THUMBNAIL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAACoCAMAAABt9SM9AAAAGFBMVEXMzMyWlpbFxcWjo6OqqqqxsbG3t7e+vr5GS0dEAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABSElEQVR4nO3PMQ0AAAjAMPy/6RzBBwkIaE9ySQAAAAAAAAAAAAAAAICf2Z3e";

export type DeepNested = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: { l: { m: { n: { o: string } } } } } } } } } } } } } } };

export const LONG_CHAIN = [1, 2, 3, 4, 5].map(x => x * 2).filter(x => x > 4).reduce((acc, x) => acc + x, 0).toString().padStart(10, '0').split('').reverse().join('').trimEnd().toLowerCase().replace(/0/g, 'O');

export const LONG_TERNARY = (a: boolean, b: boolean, c: boolean, d: boolean) => a ? (b ? (c ? (d ? "all true" : "d false") : (d ? "c false" : "c,d false")) : (c ? (d ? "b false" : "b,d false") : (d ? "b,c false" : "b,c,d false"))) : "a false";

// This line is exactly 200 characters long, padded with spaces to test fixed-width assumptions in the renderer when dealing with lines near common terminal width boundaries
// This line is exactly 300 characters long, testing what happens with moderately long lines that exceed typical editor viewport widths but are common in generated code, minified output, or data literals that get committed to source control alongside regular code

export const SQL = `SELECT u.id, u.email, u.name, p.title, p.body, p.created_at, c.text AS comment_text, c.author_id AS comment_author FROM users u LEFT JOIN posts p ON p.author_id = u.id LEFT JOIN comments c ON c.post_id = p.id WHERE u.active = true AND p.published = true ORDER BY p.created_at DESC LIMIT 100`;
