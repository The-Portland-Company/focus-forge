export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, "https://focusforge.dev");
    return Response.redirect(target.toString(), 301);
  },
};
