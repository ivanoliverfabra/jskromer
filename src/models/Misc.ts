import { KROMER_ENDPOINT } from "../constants";
import {
  get,
  mapResult,
  parseErrorMessage,
  post,
  type Result,
  resultErr,
} from "../utils";
import { type PrivateKeyResolvable, resolvePrivateKey } from "./Wallet";

export interface MotdPackage {
  name: string;
  version: string;
  author: string;
  licence: string;
  repository: string;
}

export interface MotdConstants {
  wallet_version: number;
  nonce_max_size: number;
  name_cost: number;
  min_work: number;
  max_work: number;
  work_factor: number;
  seconds_per_block: number;
}

export interface MotdCurrency {
  address_prefix: string;
  name_suffix: string;
  currency_name: string;
  currency_symbol: string;
}

export interface MotdType {
  server_time: string;
  motd: string;
  set: null;
  motd_set: null;
  public_url: string;
  public_ws_url: string;
  mining_enabled: boolean;
  transactions_enabled: boolean;
  debug_mode: boolean;
  work: number;
  last_block: null;
  package: MotdPackage;
  constants: MotdConstants;
  currency: MotdCurrency;
  notice: string;
}

// biome-ignore lint/complexity/noStaticOnlyClass: this is a utility class
export class Misc {
  static async getSupply(): Promise<Result<number>> {
    const res = await get<{ money_supply: number }>(
      `${KROMER_ENDPOINT}/supply`,
    );
    return mapResult(res, (v) => v.money_supply);
  }

  static async getMotd(): Promise<Result<MotdType>> {
    const res = await get<MotdType>(`${KROMER_ENDPOINT}/motd`);
    return mapResult(res, (v) => v);
  }

  static async login(
    pkey: PrivateKeyResolvable,
  ): Promise<Result<{ authed: boolean; address: string | null }>> {
    try {
      const res = await post<{ authed: boolean; address: string | null }>(
        `${KROMER_ENDPOINT}/login`,
        {
          privatekey: resolvePrivateKey(pkey),
        },
      );
      return mapResult(res, (v) => v);
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }
}
