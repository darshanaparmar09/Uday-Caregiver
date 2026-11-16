import { registerHealthReader } from "../shared/health";
import { readHealthConnect } from "./android";
/** Android build: Health Connect. Needs the development or store build (not Expo Go). */
export function registerPhoneHealth() { registerHealthReader(readHealthConnect); }
