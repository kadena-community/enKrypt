<template>
  <section
    v-if="activity.type === ActivityType.transaction"
    class="container-empty"
  >
    <div class="network-activity__transaction">
      <a
        :href="transactionURL"
        target="_blank"
        class="network-activity__transaction-info"
      >
        <img
          :src="
            network.identicon(activity.isIncoming ? activity.from : activity.to)
          "
          @error="imageLoadError"
        />

        <div class="network-activity__transaction-info-name">
          <h4>
            {{
              $filters.replaceWithEllipsis(
                network.displayAddress(
                  activity.isIncoming ? activity.from : activity.to
                ),
                6,
                6
              )
            }}
          </h4>
          <p>
            <span
              class="network-activity__transaction-info-status"
              :class="{ error: activity.status === ActivityStatus.failed }"
              >{{ status }}</span
            >
            <transaction-timer
              v-if="
                activity.status === ActivityStatus.pending ||
                activity.status === ActivityStatus.executing_continuation
              "
              :date="activity.timestamp"
            />
            <span v-else-if="activity.timestamp !== 0">{{ date }}</span>
            <span
              v-if="network.subNetworks && activity.chainId !== undefined"
              class="network-activity__transaction-info-chainid"
              >{{
                activity.crossChainId !== null
                  ? `to chain ${activity.crossChainId}`
                  : ""
              }}
            </span>
          </p>
        </div>
      </a>

      <div class="network-activity__transaction-amount">
        <button
          class="network-activity__transaction-finish-tx-button"
          v-if="activity.status === ActivityStatus.needs_continuation"
          @click="sendAction"
        >
          Finish tx
        </button>
        <button
          class="network-activity__transaction-finish-tx-button"
          v-if="activity.status === ActivityStatus.waiting_for_spv"
          @click="sendAction"
        >
          waiting_for_spv
        </button>
        <h4>
          {{ !activity.isIncoming ? "-" : "" }}
          {{
            $filters.formatFloatingPointValue(
              fromBase(activity.value, activity.token.decimals)
            ).value
          }}
          <span>{{ activity.token.symbol }}</span>
        </h4>
        <p v-show="getFiatValue.gt(0)">
          $ {{ $filters.formatFiatValue(getFiatValue).value }}
        </p>
      </div>
    </div>
  </section>
  <section v-if="activity.type === ActivityType.swap" class="container-empty">
    <section class="network-activity__transaction">
      <div class="network-activity__transaction-info">
        <img
          :src="(activity.rawInfo as SwapRawInfo).toToken.logoURI"
          @error="imageLoadError"
        />

        <div class="network-activity__transaction-info-name">
          <h4>
            Swap from
            {{ (activity.rawInfo as SwapRawInfo).fromToken.symbol }} to
            {{ (activity.rawInfo as SwapRawInfo).toToken.symbol }}
          </h4>
          <p>
            <span
              class="network-activity__transaction-info-status"
              :class="{ error: activity.status === ActivityStatus.failed }"
              >{{ status }}</span
            >
            <transaction-timer
              v-if="
                activity.status === ActivityStatus.pending ||
                activity.status === ActivityStatus.executing_continuation
              "
              :date="activity.timestamp"
            />
            <span v-else-if="activity.timestamp !== 0">{{ date }}</span>
          </p>
        </div>
      </div>

      <div class="network-activity__transaction-amount">
        <h4>
          {{
            $filters.formatFloatingPointValue(
              fromBase(activity.value, activity.token.decimals)
            ).value
          }}
          <span>{{
            activity.token.symbol.length > 40
              ? activity.token.symbol.substring(0, 40) + "..."
              : activity.token.symbol
          }}</span>
        </h4>
        <p>$ {{ $filters.formatFiatValue(getFiatValue).value }}</p>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { onBeforeMount, computed, onMounted, PropType, ref } from "vue";
import moment from "moment";
import { routes as RouterNames } from "@/ui/action/router";
import TransactionTimer from "./transaction-timer.vue";
import {
  Activity,
  ActivityStatus,
  ActivityType,
  SwapRawInfo,
} from "@/types/activity";
import { BaseNetwork } from "@/types/base-network";
import { fromBase } from "@enkryptcom/utils";
import BigNumber from "bignumber.js";
import { imageLoadError } from "@/ui/action/utils/misc";
import { CreateTxFeeObject } from "../../../../../providers/kadena/ui/libs/createTxFeeObject";
import { KDAToken } from "@/providers/kadena/types/kda-token";

const props = defineProps({
  activity: {
    type: Object as PropType<Activity>,
    default: () => ({}),
  },
  network: {
    type: Object as PropType<BaseNetwork>,
    default: () => ({}),
  },
  selectedAccount: {
    type: Object,
    default: () => {
      return "";
    },
  },
});

const router = useRouter();
const status = ref("~");
const date = ref("~");
const kdaToken = ref<KDAToken>();

const transactionURL = computed(() => {
  return props.network.blockExplorerTX.replace(
    "[[txHash]]",
    props.activity.transactionHash
  );
});
const continueUrl = computed(() => {
  return `https://tools.kadena.io/transactions/cross-chain-transfer-finisher?reqKey=${props.activity.transactionHash}`;
});
const getFiatValue = computed(() => {
  return new BigNumber(props.activity.token.price || "0").times(
    fromBase(props.activity.value, props.activity.token.decimals)
  );
});

onBeforeMount(async () => {
  kdaToken.value = new KDAToken({
    price: "0",
    symbol: "KDA",
    decimals: 12,
  });
});

onMounted(() => {
  date.value = moment(props.activity.timestamp).fromNow();
  if (
    props.activity.status === ActivityStatus.success &&
    props.activity.isIncoming
  )
    status.value =
      props.activity.type === ActivityType.transaction ? "Received" : "Swapped";
  else if (
    props.activity.status === ActivityStatus.success &&
    !props.activity.isIncoming
  )
    status.value =
      props.activity.type === ActivityType.transaction ? "Sent" : "Swapped";
  else if (
    props.activity.status === ActivityStatus.pending &&
    props.activity.isIncoming
  )
    status.value =
      props.activity.type === ActivityType.transaction
        ? "Receiving"
        : "Swapping";
  else if (
    props.activity.status === ActivityStatus.pending &&
    !props.activity.isIncoming
  )
    status.value =
      props.activity.type === ActivityType.transaction ? "Sending" : "Swapping";
  else if (props.activity.status === ActivityStatus.needs_continuation)
    status.value = "Sent";
  else {
    status.value = "Failed";
  }
});

const sendAction = async () => {
  const secondStepTransaction = await kdaToken.value!
    .buildCrossChainSecondStepTransaction!(
    props.selectedAccount,
    props.activity.transactionHash,
    props.activity.spv,
    false,
    props.network as KadenaNetwork,
    props.activity.chainId.toString()
  );

  const networkApi = (await props.network.api()) as KadenaAPI;
  const transactionResult = await networkApi.sendLocalTransaction(
    secondStepTransaction
  );

  const gasLimit = transactionResult.metaData?.publicMeta?.gasLimit;
  const gasPrice = transactionResult.metaData?.publicMeta?.gasPrice;
  const gasFee = gasLimit && gasPrice ? gasLimit * gasPrice : 0;

  const txFeeObject = CreateTxFeeObject(gasFee, 12, kdaToken.value);

  const txVerifyInfo = {
    transactionType: "finish_crosschain",
    toChainId: props.activity.crossChainId,
    pactId: props.activity.transactionHash,
    spv: props.activity.spv.replaceAll('"', ""),
    txFee: txFeeObject,
  };

  const routedRoute = router.resolve({
    name: RouterNames.verify.name,
    query: {
      id: props.network.name,
      txData: Buffer.from(JSON.stringify(txVerifyInfo), "utf8").toString(
        "base64"
      ),
    },
  });
  router.push(routedRoute);
};
</script>

<style lang="less">
@import "~@action/styles/theme.less";
.container-empty {
  display: contents;
}
.network-activity {
  &__transaction {
    height: 64px;
    padding: 0 8px;
    position: relative;
    box-sizing: border-box;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-direction: row;
    text-decoration: none;
    margin: 0 12px;
    border-radius: 10px;
    transition: background 300ms ease-in-out;

    &:hover {
      background: rgba(0, 0, 0, 0.04);
    }

    &-info {
      display: flex;
      text-decoration: none;
      justify-content: flex-start;
      align-items: center;
      flex-direction: row;
      cursor: pointer;

      img {
        max-width: 32px;
        max-height: 32px;
        margin-right: 16px;
        border-radius: 100%;
      }

      &-name {
        h4 {
          font-style: normal;
          font-weight: 400;
          font-size: 16px;
          line-height: 24px;
          color: @primaryLabel;
          margin: 0 0 1px 0;
        }

        p {
          font-style: normal;
          font-weight: 400;
          font-size: 12px;
          line-height: 16px;
          letter-spacing: 0.5px;
          color: @secondaryLabel;
          margin: 0;
          display: flex;
          justify-content: flex-start;
          align-items: center;
          flex-direction: row;

          .error {
            color: @error;
          }
        }
      }

      &-crosschain-superscript {
        color: @secondaryLabel;
      }

      &-status {
        margin-right: 4px;
      }

      &-chainid {
        margin-left: 4px;
      }
    }

    &-amount {
      text-align: right;

      h4 {
        font-style: normal;
        font-weight: 500;
        font-size: 16px;
        line-height: 24px;
        text-align: right;
        color: @primaryLabel;
        margin: 0 0 1px 0;

        span {
          font-variant: small-caps;
        }
      }

      p {
        font-style: normal;
        font-weight: 400;
        font-size: 12px;
        line-height: 16px;
        letter-spacing: 0.5px;
        color: @secondaryLabel;
        margin: 0;
      }
    }

    &-finish-tx-button {
      background-color: #ffffff;
      font-size: 12px;
    }
  }
}
</style>
