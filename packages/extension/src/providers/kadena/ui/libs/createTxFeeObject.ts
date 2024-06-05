import { toBN } from "web3-utils";
import { GasFeeInfo } from "@/providers/common/types";
import { fromBase, toBase } from "@enkryptcom/utils";
import BigNumber from "bignumber.js";

const CreateTxFeeObject = (
  gasFee: number,
  selectedAssetDecimals: any,
  nativeAsset: any
): GasFeeInfo => {
  const rawFee = toBN(toBase(gasFee.toString(), selectedAssetDecimals));

  const txFeeHuman = fromBase(rawFee?.toString() ?? "", nativeAsset.decimals!);

  const txPrice = new BigNumber(nativeAsset.price!).times(txFeeHuman);

  return {
    fiatSymbol: "USD",
    fiatValue: txPrice.toString(),
    nativeSymbol: nativeAsset.symbol ?? "",
    nativeValue: txFeeHuman.toString(),
  };
};

export { CreateTxFeeObject };
