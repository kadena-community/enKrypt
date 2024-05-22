import { ToTokenData } from "@/ui/action/types/token";
import { EnkryptAccount } from "@enkryptcom/types";

export interface TxFeeInfo {
  nativeValue: string;
  fiatValue: string;
  nativeSymbol: string;
  fiatSymbol: string;
}

export interface SendTransactionDataType {
  from: string;
  value: string;
  to: string;
  data: `0x${string}`;
}

export enum TransactionType {
  normal = "normal",
  finish_crosschain = "finish_crosschain",
}

export interface VerifyTransactionParams {
  transactionType: TransactionType;
  fromAddress: string;
  fromAddressName: string;
  toChainId: string;
  toAddress: string;
  toAddressName?: string;
  toToken: ToTokenData;
  txFee: TxFeeInfo;
  TransactionData: SendTransactionDataType;
  spv?: string;
  pactId?: string;
}

export interface SignerTransactionOptions {
  payload: string;
  account: EnkryptAccount;
}
