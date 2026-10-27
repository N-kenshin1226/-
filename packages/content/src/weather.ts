import raw from "../weather.json";
import { weatherFileSchema, type WeatherFile } from "./weather.schema.js";

const parsed = weatherFileSchema.safeParse(raw);
if (!parsed.success) {
  throw new Error(`weather.json がスキーマ違反: ${parsed.error.message}`);
}
export const weather: WeatherFile = parsed.data;
