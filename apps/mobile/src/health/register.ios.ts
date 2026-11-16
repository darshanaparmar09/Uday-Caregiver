import { registerHealthReader } from "../shared/health";
import { readAppleHealth } from "./ios";
/** iPhone build: Apple Health. Needs the development or store build (not Expo Go). */
export function registerPhoneHealth() { registerHealthReader(readAppleHealth); }
