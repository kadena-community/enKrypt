import { BaseToken, BaseTokenOptions } from "@/types/base-token";
import KadenaAPI from "@/providers/kadena/libs/api";
import {
  ChainId,
  ICommand,
  IUnsignedCommand,
  Pact,
  addSignatures,
  readKeyset,
} from "@kadena/client";
import { EnkryptAccount } from "@enkryptcom/types";
import { blake2AsU8a } from "@polkadot/util-crypto";
import { KadenaNetwork } from "./kadena-network";
import { TransactionSigner } from "../ui/libs/signer";
import { bufferToHex } from "@enkryptcom/utils";

export abstract class KDABaseToken extends BaseToken {
  public abstract buildSameChainTransaction(
    to: string,
    from: EnkryptAccount,
    amount: string,
    network: KadenaNetwork,
    chainId: string
  ): Promise<ICommand>;

  public abstract buildCrossChainFirstStepTransaction(
    to: string,
    from: EnkryptAccount,
    amount: string,
    network: KadenaNetwork,
    fromChainId: string,
    toChainId: string
  ): Promise<ICommand>;

  public abstract buildCrossChainSecondStepTransaction(
    from: EnkryptAccount | any,
    pactId: string,
    spv: string,
    useGasStation: boolean,
    network: KadenaNetwork,
    toChainId: string
  ): Promise<IUnsignedCommand | ICommand>;

  public abstract getAccountDetails(
    account: string,
    network: KadenaNetwork
  ): Promise<any>;

  public abstract getBalance(
    api: KadenaAPI,
    pubkey: string,
    chainId?: string
  ): Promise<string>;
}

export class KDAToken extends KDABaseToken {
  constructor(options: BaseTokenOptions) {
    super(options);
  }

  public async getLatestUserBalance(): Promise<string> {
    throw new Error("KDA-getLatestUserBalance is not implemented here");
  }

  public async getBalance(api: KadenaAPI, pubkey: string): Promise<string> {
    return api.getBalance(pubkey);
  }

  public async send(): Promise<any> {
    throw new Error("KDA-send is not implemented here");
  }

  public async buildSameChainTransaction(
    to: string,
    from: EnkryptAccount | any,
    amount: string,
    network: KadenaNetwork,
    chainId?: string
  ): Promise<ICommand> {
    to = network.displayAddress(to);
    const keySetAccount = to.startsWith("k:") ? to.replace("k:", "") : to;

    const unsignedTransaction = Pact.builder
      .execution(
        Pact.modules.coin["transfer-create"](
          network.displayAddress(from.address),
          to,
          readKeyset("ks"),
          {
            decimal: amount,
          }
        )
      )
      .addKeyset("ks", "keys-all", keySetAccount)
      .addSigner(from.publicKey.replace("0x", ""), (withCap: any) => [
        withCap("coin.TRANSFER", network.displayAddress(from.address), to, {
          decimal: amount,
        }),
        withCap("coin.GAS"),
      ])
      .setMeta({
        chainId: (chainId ??
          network.options.kadenaApiOptions.chainId) as ChainId,
        senderAccount: network.displayAddress(from.address),
      })
      .setNetworkId(network.options.kadenaApiOptions.networkId)
      .createTransaction();

    return await this.signTransaction(unsignedTransaction, from, network);
  }

  public async buildCrossChainFirstStepTransaction(
    to: string,
    from: EnkryptAccount | any,
    amount: string,
    network: KadenaNetwork,
    fromChainId: string,
    toChainId: string
  ): Promise<ICommand> {
    to = network.displayAddress(to);
    const keySetAccount = to.startsWith("k:") ? to.replace("k:", "") : to;

    const unsignedTransaction = Pact.builder
      .execution(
        Pact.modules.coin.defpact["transfer-crosschain"](
          network.displayAddress(from.address),
          to,
          readKeyset("ks"),
          toChainId,
          {
            decimal: amount,
          }
        )
      )
      .addKeyset("ks", "keys-all", keySetAccount)
      .addSigner(from.publicKey.replace("0x", ""), (withCap: any) => [
        withCap(
          "coin.TRANSFER_XCHAIN",
          network.displayAddress(from.address),
          to,
          {
            decimal: amount,
          },
          toChainId
        ),
        withCap("coin.GAS"),
      ])
      .setMeta({
        chainId: (fromChainId ??
          network.options.kadenaApiOptions.chainId) as ChainId,
        senderAccount: network.displayAddress(from.address),
      })
      .setNetworkId(network.options.kadenaApiOptions.networkId)
      .createTransaction();

    return await this.signTransaction(unsignedTransaction, from, network);
  }

  public async buildCrossChainSecondStepTransaction(
    from: EnkryptAccount | any,
    pactId: string,
    spv: string,
    useGasStation: boolean,
    network: KadenaNetwork,
    toChainId: string
  ): Promise<IUnsignedCommand | ICommand> {
    const builder = Pact.builder
      .continuation({
        pactId: pactId,
        proof: spv,
        rollback: false,
        step: 1,
      })
      .setMeta({
        chainId: toChainId as ChainId,
        senderAccount: useGasStation
          ? "kadena-xchain-gas"
          : network.displayAddress(from.address),
        gasLimit: 850,
      })
      .setNetworkId(network.options.kadenaApiOptions.networkId);

    if (useGasStation) {
      return builder.createTransaction();
    } else {
      builder.addSigner(from.publicKey.replace("0x", ""), (withCap: any) => [
        withCap("coin.GAS"),
      ]);

      const transaction = builder.createTransaction();
      return await this.signTransaction(transaction, from, network);
    }
  }

  private async signTransaction(
    unsignedTransaction: IUnsignedCommand,
    account: EnkryptAccount | any,
    network: KadenaNetwork
  ): Promise<ICommand> {
    if (account.isHardware) {
      const transaction = await TransactionSigner({
        account,
        payload: unsignedTransaction.cmd,
        network,
      }).then((res) => {
        if (res.error) return Promise.reject(res.error);
        return JSON.parse(res.result as string);
      });

      return transaction as ICommand;
    }

    const transaction = await TransactionSigner({
      account,
      payload: bufferToHex(blake2AsU8a(unsignedTransaction.cmd)),
      network,
    }).then((res) => {
      if (res.error) return Promise.reject(res.error);
      else
        return {
          id: 0,
          signature: res.result?.replace("0x", "") as string,
        };
    });

    return addSignatures(unsignedTransaction, {
      sig: transaction.signature,
      pubKey: account.pubKey,
    }) as ICommand;
  }

  public async getAccountDetails(
    account: string,
    network: KadenaNetwork
  ): Promise<any> {
    const api = (await network.api()) as KadenaAPI;
    const chainID = await api.getChainId();
    const modules = Pact.modules as any;
    const unsignedTransaction = Pact.builder
      .execution(modules.coin.details(account))
      .setMeta({
        chainId: (chainID ??
          network.options.kadenaApiOptions.chainId) as ChainId,
      })
      .setNetworkId(network.options.kadenaApiOptions.networkId)
      .createTransaction();
    const response = await api.dirtyRead(unsignedTransaction as ICommand);

    return response.result;
  }
}
