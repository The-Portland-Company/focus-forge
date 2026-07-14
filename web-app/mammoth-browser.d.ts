// The browser build ships JS only; reuse the main module's type surface so we
// can import `mammoth/mammoth.browser` (avoids pulling Node deps into the client
// bundle) with full typing.
declare module "mammoth/mammoth.browser" {
  import mammoth from "mammoth";
  export default mammoth;
}
