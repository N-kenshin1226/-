import raw from "../books.json";
import { booksFileSchema, type BooksFile } from "./books.schema.js";

const parsed = booksFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`books.json がスキーマ違反: ${parsed.error.message}`);
}
export const books: BooksFile = parsed.data;
