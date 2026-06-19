declare module "postcss-sass" {
  import type { Root } from "postcss";

  interface PostcssSassSyntax {
    parse(source: string): Root;
  }

  const postcssSass: PostcssSassSyntax;
  export default postcssSass;
}
