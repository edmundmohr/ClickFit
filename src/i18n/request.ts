import { getRequestConfig } from "next-intl/server";
import { LOCALE, TIME_ZONE } from "./config";
import messages from "../../messages";

export default getRequestConfig(async () => ({ locale: LOCALE, messages, timeZone: TIME_ZONE }));
