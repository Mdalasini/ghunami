/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authFlow from "../authFlow.js";
import type * as donations from "../donations.js";
import type * as funds from "../funds.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_fundFields from "../lib/fundFields.js";
import type * as lib_fundId from "../lib/fundId.js";
import type * as lib_mpesa from "../lib/mpesa.js";
import type * as lib_richText from "../lib/richText.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authFlow: typeof authFlow;
  donations: typeof donations;
  funds: typeof funds;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/fundFields": typeof lib_fundFields;
  "lib/fundId": typeof lib_fundId;
  "lib/mpesa": typeof lib_mpesa;
  "lib/richText": typeof lib_richText;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
