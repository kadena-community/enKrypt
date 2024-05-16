import cacheFetch from "@/libs/cache-fetch";
import MarketData from "@/libs/market-data";
import { Activity, ActivityStatus, ActivityType } from "@/types/activity";
import { BaseNetwork } from "@/types/base-network";
import { NetworkEndpoints, NetworkTtls } from "./configs";
import { toBase } from "@enkryptcom/utils";
import KadenaAPI from "@/providers/kadena/libs/api";
import { ChainId, Pact } from "@kadena/client";

const getAddressActivity = async (
  address: string,
  endpoint: string,
  ttl: number,
  height: number
): Promise<any[]> => {
  const url = `${endpoint}txs/account/${address}?minheight=${height}&limit=200&token=coin`;
  return cacheFetch({ url }, ttl)
    .then((res) => {
      return res ? res : [];
    })
    .catch((error) => {
      console.error("Failed to fetch activity:", error);
      return [];
    });
};

export default async (
  network: BaseNetwork,
  address: string
): Promise<Activity[]> => {
  const networkName = network.name as keyof typeof NetworkEndpoints;
  const enpoint = NetworkEndpoints[networkName];
  const ttl = NetworkTtls[networkName];
  const api = (await network.api()) as KadenaAPI;
  const chainId = await api.getChainId();

  let activities = await getAddressActivity(
    address,
    enpoint,
    ttl,
    0 // lastActivity?.rawInfo?.height ?? 0
  );

  let price = "0";

  if (network.coingeckoID) {
    const marketData = new MarketData();
    await marketData
      .getTokenPrice(network.coingeckoID)
      .then((mdata) => (price = mdata || "0"));
  }

  const groupActivities = activities
    // .filter((a) => a.chain == chainId || a.crossChainId == chainId)
    .reduce((acc: any, activity: any) => {
      if (!acc[activity.requestKey]) {
        acc[activity.requestKey] = activity;
      }
      if (activity.idx !== 0) {
        acc[activity.requestKey] = activity;
      }
      return acc;
    }, {});

  console.log({ groupActivities });

  activities = Object.values(groupActivities).map(
    (activity: any, i: number) => {
      const rawAmount = toBase(
        activity.amount
          ? parseFloat(activity.amount).toFixed(network.decimals)
          : "0",
        network.decimals
      );

      // note: intentionally not using fromAccount === some-value
      // I want to match both null and "" in fromAccount/toAccount
      // actual values will be a (truthy) string
      let { fromAccount, toAccount } = activity;
      if (!fromAccount && activity.crossChainAccount) {
        fromAccount = activity.crossChainAccount;
      }
      if (!toAccount && activity.crossChainAccount) {
        toAccount = activity.crossChainAccount;
      }

      return {
        nonce: i.toString(),
        from: fromAccount,
        to: toAccount,
        isIncoming:
          (!activity.crossChainId && fromAccount !== address) ||
          (activity.crossChainId && activity.crossChainId === chainId),
        network: network.name,
        rawInfo: activity,
        chainId: activity.chain.toString(),
        crossChainId: activity.crossChainId,
        status:
          activity.idx !== 0 ? ActivityStatus.success : ActivityStatus.failed,
        timestamp: new Date(activity.blockTime).getTime(),
        value: rawAmount,
        transactionHash: activity.requestKey,
        type: ActivityType.transaction,
        token: {
          decimals: network.decimals,
          icon: network.icon,
          name: network.currencyNameLong,
          symbol:
            activity.token !== "coin" ? activity.token : network.currencyName,
          price: price,
        },
      };
    }
  );

  await Promise.allSettled(
    activities.map(async (activity: any) => {
      if (
        activity.status === ActivityStatus.success &&
        activity.crossChainId !== null
      ) {
        const fetchSpvResponse = await fetch(
          `${network.node}/testnet04/chain/${activity.chainId}/pact/spv`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestKey: activity.transactionHash,
              targetChainId: String(activity.crossChainId),
            }),
          }
        );

        const spv = await fetchSpvResponse.json();

        const tx = Pact.builder
          .continuation({
            proof: spv,
            data: {},
            pactId: activity.transactionHash,
            rollback: false,
            step: 1,
          })
          .setMeta({
            chainId: String(activity.rawInfo.crossChainId) as ChainId,
            senderAccount: activity.from,
          })
          .createTransaction();

        const transactionResult = await api.sendLocalTransaction(
          tx,
          { signatureVerification: false, preflight: false },
          String(activity.rawInfo.crossChainId) as ChainId
        );

        if (transactionResult.result.status === "success") {
          activity.status = ActivityStatus.needs_continuation;
        }
      }
    })
  );
  return activities;
};
