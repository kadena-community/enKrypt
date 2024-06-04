<template>
  <div class="container">
    <custom-scrollbar
      class="network-activity__scroll-area"
      :settings="scrollSettings({ suppressScrollX: true })"
    >
      <div class="network-activity">
        <network-activity-total
          :crypto-amount="cryptoAmount"
          :fiat-amount="fiatAmount"
          :symbol="props.network.currencyName"
          v-bind="$attrs"
        />

        <network-activity-action v-bind="$attrs" />
        <div v-if="activities.length">
          <network-activity-transaction
            v-for="(item, index) in activities"
            :key="index + `${forceUpdateVal}`"
            :activity="item"
            :network="network"
            :selectedAccount="props.accountInfo.selectedAccount"
          />
        </div>
        <!-- <div class="network-activity__header">July</div>

        <network-activity-transaction
          v-for="(item, index) in transactionsTwo"
          :key="index"
          :transaction="item"
        /> -->
      </div>
    </custom-scrollbar>

    <network-activity-loading
      v-if="activities.length === 0"
      :is-empty="isNoActivity"
    />
  </div>
</template>

<script setup lang="ts">
import NetworkActivityTotal from "./components/network-activity-total.vue";
import NetworkActivityAction from "./components/network-activity-action.vue";
import NetworkActivityTransaction from "./components/network-activity-transaction.vue";
import CustomScrollbar from "@action/components/custom-scrollbar/index.vue";
import {
  computed,
  onMounted,
  onUnmounted,
  PropType,
  ref,
  toRaw,
  toRef,
  watch,
} from "vue";
import { AccountsHeaderData } from "../../types/account";
import accountInfo from "@action/composables/account-info";
import { BaseNetwork } from "@/types/base-network";
import scrollSettings from "@/libs/utils/scroll-settings";

import {
  Activity,
  ActivityStatus,
  ActivityType,
  BTCRawInfo,
  EthereumRawInfo,
  SubscanExtrinsicInfo,
  SwapRawInfo,
  KadenaRawInfo,
} from "@/types/activity";
import NetworkActivityLoading from "./components/network-activity-loading.vue";
import { ProviderName } from "@/types/provider";
import ActivityState from "@/libs/activity-state";
import Swap, {
  SupportedNetworkName,
  TransactionStatus,
  WalletIdentifier,
} from "@enkryptcom/swap";
import EvmAPI from "@/providers/ethereum/libs/api";
import type Web3Eth from "web3-eth";
import { KadenaNetwork } from "../../../../providers/kadena/types/kadena-network";
import { ITransactionDescriptor } from "@kadena/client";
import { ChainId, Pact } from "@kadena/client";
import KadenaAPI from "@/providers/kadena/libs/api";

const props = defineProps({
  network: {
    type: Object as PropType<BaseNetwork>,
    default: () => ({}),
  },
  accountInfo: {
    type: Object as PropType<AccountsHeaderData>,
    default: () => ({}),
  },
});

const { cryptoAmount, fiatAmount } = accountInfo(
  toRef(props, "network"),
  toRef(props, "accountInfo")
);

const forceUpdateVal = ref(0);
const isNoActivity = ref(false);
const activities = ref<Activity[]>([]);
const selectedAddress = computed(
  () => props.accountInfo.selectedAccount?.address || ""
);
const apiPromise = props.network.api();
const activityState = new ActivityState();
let swap: Swap;
apiPromise.then((api) => {
  swap = new Swap({
    api: (api as EvmAPI).web3 as Web3Eth,
    network: props.network.name as unknown as SupportedNetworkName,
    walletIdentifier: WalletIdentifier.enkrypt,
    evmOptions: {
      infiniteApproval: true,
    },
  });
});

const activityCheckTimers: any[] = [];
const activityAddress = computed(() =>
  props.network.displayAddress(props.accountInfo.selectedAccount!.address)
);
const updateVisibleActivity = (activity: Activity): void => {
  activities.value.forEach((act, idx) => {
    if (act.transactionHash === activity.transactionHash) {
      activities.value[idx] = activity;
    }
  });
  forceUpdateVal.value++;
};

const checkActivity = (activity: Activity): void => {
  activity = toRaw(activity);
  const timer = setInterval(() => {
    apiPromise.then((api) => {
      api.getTransactionStatus(activity.transactionHash).then((info) => {
        getInfo(activity, info, timer);
      });
    });
  }, 5000);
  activityCheckTimers.push(timer);
};
const getInfo = async (activity: Activity, info: any, timer: any) => {
  if (info) {
    if (props.network.provider === ProviderName.ethereum) {
      const evmInfo = info as EthereumRawInfo;
      activity.status = evmInfo.status
        ? ActivityStatus.success
        : ActivityStatus.failed;
      activity.rawInfo = evmInfo;
      activityState
        .updateActivity(activity, {
          address: activityAddress.value,
          network: props.network.name,
        })
        .then(() => updateVisibleActivity(activity));
    } else if (props.network.provider === ProviderName.polkadot) {
      const subInfo = info as SubscanExtrinsicInfo;
      if (!subInfo.pending) {
        activity.status = subInfo.success
          ? ActivityStatus.success
          : ActivityStatus.failed;
        activity.rawInfo = subInfo;
        activityState
          .updateActivity(activity, {
            address: activityAddress.value,
            network: props.network.name,
          })
          .then(() => updateVisibleActivity(activity));
      }
    } else if (props.network.provider === ProviderName.bitcoin) {
      const btcInfo = info as BTCRawInfo;
      activity.status = ActivityStatus.success;
      activity.rawInfo = btcInfo;
      activityState
        .updateActivity(activity, {
          address: activityAddress.value,
          network: props.network.name,
        })
        .then(() => updateVisibleActivity(activity));
    } else if (props.network.provider === ProviderName.kadena) {
      const kadenaInfo = info as KadenaRawInfo;
      const kadenaNetwork = props.network as KadenaNetwork;

      if (activity.status === ActivityStatus.waiting_for_spv) {
        const transferXChainEvent = activity.rawInfo.events.filter(
          (event) => event.name === "TRANSFER_XCHAIN"
        )[0];
        activity.crossChainId = transferXChainEvent.params[3];

        const transactionDescriptor: ITransactionDescriptor = {
          requestKey: activity.transactionHash,
          chainId: activity.chainId,
          networkId: kadenaNetwork.options.kadenaApiOptions.networkId,
        };

        let spv;
        try {
          const fetchSpvResponse = await fetch(
            `${kadenaNetwork.node}/testnet04/chain/${activity.chainId}/pact/spv`,
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

          if (fetchSpvResponse.status !== 200) {
            return;
          }

          spv = await fetchSpvResponse.json();
        } catch (error) {
          console.error("error", error);
        }

        activity.spv = spv;
        activity.status = ActivityStatus.needs_continuation;
      } else if (activity.status === ActivityStatus.pending) {
        activity.rawInfo = kadenaInfo as KadenaRawInfo;

        if (kadenaInfo.result.status === "success") {
          if (activity.rawInfo.continuation?.executed !== null) {
            activity.status = ActivityStatus.success;
          } else {
            activity.status = ActivityStatus.waiting_for_spv;
            activityState
              .updateActivity(activity, {
                address: activityAddress.value,
                network: props.network.name,
              })
              .then(() => updateVisibleActivity(activity));
            return;
          }
        } else {
          activity.status = ActivityStatus.failed;
        }
      } else if (activity.status === ActivityStatus.executing_continuation) {
        activityState
          .updateActivity(activity, {
            address: activityAddress.value,
            network: props.network.name,
          })
          .then(() => updateVisibleActivity(activity));

        const tx = Pact.builder
          .continuation({
            proof: activity.spv,
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

        const api = (await props.network.api()) as KadenaAPI;
        const crossChainId = (
          activity.rawInfo.crossChainId
            ? activity.rawInfo.crossChainId
            : activity.crossChainId
        ) as ChainId;
        const { result } = await api.sendLocalTransaction(
          tx,
          { signatureVerification: false, preflight: false },
          crossChainId
        );

        if (result.status === "success") {
          return;
        } else if (result.status === "failure") {
          if (result.error.message.includes("pact completed")) {
            activity.status = ActivityStatus.continuation_executed;
          } else return;
        }
      }

      activityState
        .updateActivity(activity, {
          address: activityAddress.value,
          network: props.network.name,
        })
        .then(() => updateVisibleActivity(activity));
    }
    clearInterval(timer);
  }
};
const checkSwap = (activity: Activity): void => {
  activity = toRaw(activity);
  const timer = setInterval(() => {
    if (swap) {
      swap.initPromise.then(() => {
        swap
          .getStatus((activity.rawInfo as SwapRawInfo).status)
          .then((info) => {
            if (info === TransactionStatus.pending) return;
            activity.status =
              info === TransactionStatus.success
                ? ActivityStatus.success
                : ActivityStatus.failed;
            activityState
              .updateActivity(activity, {
                address: activityAddress.value,
                network: props.network.name,
              })
              .then(() => updateVisibleActivity(activity));
          });
      });
    }
  }, 5000);
  activityCheckTimers.push(timer);
};
const selectedNetworkName = computed(() => props.network.name);
const setActivities = () => {
  activities.value = [];
  isNoActivity.value = false;
  if (props.accountInfo.selectedAccount)
    props.network.getAllActivity(activityAddress.value).then((all) => {
      activities.value = all;
      isNoActivity.value = all.length === 0;
      activities.value.forEach((act) => {
        if (
          (act.status === ActivityStatus.pending ||
            act.status === ActivityStatus.waiting_for_spv ||
            act.status === ActivityStatus.executing_continuation) &&
          act.type === ActivityType.transaction
        )
          checkActivity(act);
        if (
          act.status === ActivityStatus.pending &&
          act.type === ActivityType.swap
        )
          checkSwap(act);
      });
    });
  else activities.value = [];
};

watch([selectedAddress, selectedNetworkName], setActivities);
onMounted(() => {
  setActivities();
  activityCheckTimers.forEach((timer) => clearInterval(timer));
});
onUnmounted(() => {
  activityCheckTimers.forEach((timer) => clearInterval(timer));
});
</script>

<style lang="less" scoped>
@import "~@action/styles/theme.less";
@import "~@action/styles/custom-scroll.less";

.container {
  width: 100%;
  height: 600px;
  background-color: @white;
  box-shadow: 0px 0px 3px rgba(0, 0, 0, 0.16);
  margin: 0;
  padding-top: 0;
  box-sizing: border-box;

  .deposit {
    left: 0;
  }
}

.network-activity {
  width: 100%;
  height: 100%;
  box-sizing: border-box;

  &__scroll-area {
    position: relative;
    margin: auto;
    width: 100%;
    max-height: 540px;
    margin: 0;
    padding: 68px 0 0 0 !important;
    box-sizing: border-box;
    .ps__rail-y {
      right: 3px !important;
      margin: 59px 0 !important;
    }
    &.ps--active-y {
      padding-right: 0;
    }
  }

  &__header {
    padding: 8px 20px 0 20px;
    font-style: normal;
    font-weight: 700;
    font-size: 16px;
    line-height: 24px;
    color: @primaryLabel;
    margin: 0;
  }
}
</style>
