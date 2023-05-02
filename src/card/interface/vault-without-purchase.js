/* @flow */

import { ZalgoPromise } from "@krakenjs/zalgo-promise/src";

import {
  updateVaultSetupToken,
  type PaymentSourceInput,
} from "../../api/vault";
import {
  vaultWithoutPurchaseSuccess,
  vaultWithoutPurchaseFailure,
} from "../logger";
import type {
  XOnError,
  CreateVaultSetupToken,
  SaveActionOnApprove,
} from "../../props";
import { SUBMIT_ERRORS } from "../constants";

type VaultPaymenSourceOptions = {|
  createVaultSetupToken: CreateVaultSetupToken,
  onApprove: SaveActionOnApprove,
  onError: XOnError,
  clientID: string,
  paymentSource: PaymentSourceInput,
|};

export const savePaymentSource = ({
  createVaultSetupToken,
  onApprove,
  onError,
  clientID,
  paymentSource,
}: VaultPaymenSourceOptions): ZalgoPromise<void> => {
  let vaultToken;
  return createVaultSetupToken()
    .then((vaultSetupToken) => {
      if (typeof vaultSetupToken !== "string") {
        throw new TypeError(SUBMIT_ERRORS.VAULT_TOKEN_TYPE_ERROR);
      }
      vaultToken = vaultSetupToken;
      return updateVaultSetupToken({
        vaultSetupToken,
        clientID,
        paymentSource,
      });
    })
    .then(() => onApprove({ vaultSetupToken: vaultToken }))
    .then(() => vaultWithoutPurchaseSuccess({ vaultToken }))
    .catch((error) => {
      if (typeof error === "string") {
        error = new Error(error);
      }
      vaultWithoutPurchaseFailure({ error, vaultToken });
      onError(error);
      throw error;
    });
};
