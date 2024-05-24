<template>
  <div class="container" :class="{ popup: isPopup }">
    <div v-if="!!selectedNetwork" class="verify-transaction">
      <div class="verify-transaction__header" :class="{ popup: isPopup }">
        <h3>Verify Finish Crosschain Transaction</h3>
        <a v-if="!isPopup" class="verify-transaction__close" @click="close">
          <close-icon />
        </a>
      </div>
      <hardware-wallet-msg :wallet-type="account?.walletType" />

      <p class="verify-transaction__description" :class="{ popup: isPopup }">
        Double check the information and confirm transaction
      </p>
      <div
        class="verify-transaction__info"
        :class="{ popup: isPopup, border: isHasScroll() }"
      >
        <verify-transaction-network :network="network" />
        <verify-transaction-account
          :name="props.selectedAccountName"
          :address="network.displayAddress(selectedAccountAddress)"
          :from="true"
          :network="network"
          :subnetwork="'Chain ' + txData.toChainId"
        />
        <verify-transaction-fee :fee="txData.txFee" />
      </div>

      <div
        class="verify-transaction__buttons"
        :class="{ popup: isPopup, border: isHasScroll() }"
      >
        <div class="verify-transaction__buttons-cancel">
          <base-button
            title="Back"
            :click="close"
            :gray="true"
            :disabled="isProcessing"
          />
        </div>
        <div class="verify-transaction__buttons-send">
          <base-button
            title="Confirm and send"
            :click="sendAction"
            :disabled="isProcessing"
          />
        </div>
      </div>
    </div>

    <!-- <send-process
      :is-done="isSendDone"
      :to-address="txData.toAddress"
      :network="network"
      :token="txData.toToken"
      :is-window-popup="isWindowPopup"
      :status="sendProcessStatus"
    /> -->
  </div>
</template>

<script setup lang="ts">
import { onBeforeMount, ref, ComponentPublicInstance } from "vue";
import { useRoute, useRouter } from "vue-router";
import CloseIcon from "@action/icons/common/close-icon.vue";
import BaseButton from "@action/components/base-button/index.vue";
import VerifyTransactionNetwork from "@/providers/common/ui/verify-transaction/verify-transaction-network.vue";
import VerifyTransactionAccount from "@/providers/common/ui/verify-transaction/verify-transaction-account.vue";
import VerifyTransactionAmount from "@/providers/common/ui/verify-transaction/verify-transaction-amount.vue";
import VerifyTransactionFee from "@/providers/common/ui/verify-transaction/verify-transaction-fee.vue";
import SendAlert from "../components/send-alert.vue";
import HardwareWalletMsg from "@/providers/common/ui/verify-transaction/hardware-wallet-msg.vue";
import SendProcess from "../components/send-process.vue";
import PublicKeyRing from "@/libs/keyring/public-keyring";
import { getCurrentContext } from "@/libs/messenger/extension";
import { VerifyTransactionParams } from "../../types";
import {
  DEFAULT_KADENA_NETWORK,
  getNetworkByName,
} from "@/libs/utils/networks";
import { EnkryptAccount } from "@enkryptcom/types";
import CustomScrollbar from "@action/components/custom-scrollbar/index.vue";
import { BaseNetwork } from "@/types/base-network";
import ActivityState from "@/libs/activity-state";
import { Activity, ActivityStatus, ActivityType } from "@/types/activity";
import { KDAToken } from "@/providers/kadena/types/kda-token";
import KadenaAPI from "@/providers/kadena/libs/api";
import { KadenaNetwork } from "@/providers/kadena/types/kadena-network";

const isSendDone = ref(false);
const sendProcessStatus = ref("");
const account = ref<EnkryptAccount>();
const fromChainId = ref<string>();
const toChainId = ref<string>();
const kdaToken = ref<KDAToken>();
const KeyRing = new PublicKeyRing();
const route = useRoute();
const router = useRouter();
const selectedNetwork: string = route.query.id as string;
const txData: VerifyTransactionParams = JSON.parse(
  Buffer.from(route.query.txData as string, "base64").toString("utf8")
);
const errorMsg = ref("");
const isProcessing = ref(false);
const isPopup: boolean = getCurrentContext() === "new-window";
const isWindowPopup = ref(false);
const verifyScrollRef = ref<ComponentPublicInstance<HTMLElement>>();
defineExpose({ verifyScrollRef });
const network = ref<BaseNetwork>(DEFAULT_KADENA_NETWORK);

console.log({ txData });

const props = defineProps({
  selectedAccountName: {
    type: String,
    default: () => {
      return "";
    },
  },
  selectedAccountAddress: {
    type: String,
    default: () => {
      return "";
    },
  },
});

onBeforeMount(async () => {
  account.value = await KeyRing.getAccount(props.selectedAccountAddress);
  isWindowPopup.value = account.value.isHardware;
});

const close = () => {
  if (getCurrentContext() === "popup") {
    router.go(-1);
  } else {
    window.close();
  }
};

const sendAction = async () => {
  isProcessing.value = true;
  isSendDone.value = false;

  try {
    sendCrossChainFinishTransaction();

    isSendDone.value = true;

    if (getCurrentContext() === "popup") {
      setTimeout(() => {
        isProcessing.value = false;
        router.push({ name: "activity", params: { id: network.value.name } });
      }, 2500);
    } else {
      setTimeout(() => {
        isProcessing.value = false;
        window.close();
      }, 1500);
    }
  } catch (error: any) {
    isProcessing.value = false;
    isSendDone.value = true;

    console.error("error", error);
    errorMsg.value = `Error: ${
      error.message || "Could not send the transaction"
    }`;
  }
};

const sendCrossChainFinishTransaction = async () => {
  const networkApi = (await network.value.api()) as KadenaAPI;

  sendProcessStatus.value = `Cross chain finish transaction initiated.`;

  console.log("00000");
  const senderBalanceToChain = await networkApi.getBalanceByChainId(
    props.selectedAccountAddress,
    txData.toChainId as string
  );

  console.log("11111");
  sendProcessStatus.value = `Done. Claiming coins initiated on chain ${toChainId.value}...`;

  console.log("222222");
  try {
    const secondStepTransaction = await kdaToken.value!
      .buildCrossChainSecondStepTransaction!(
      account.value!,
      txData.pactId,
      txData.spv,
      senderBalanceToChain == "0",
      network.value as KadenaNetwork,
      txData.toChainId
    );

    const r = await networkApi.sendTransaction(
      secondStepTransaction,
      toChainId.value!,
      true
    );

    console.log({ r });

    sendProcessStatus.value = `Coins retrieved on chain ${toChainId.value}.`;
  } catch (error: any) {
    sendProcessStatus.value = `Please claim your coins on chain ${toChainId.value} manually.`;
  }
};

const isHasScroll = () => {
  if (verifyScrollRef.value) {
    return verifyScrollRef.value.$el.classList.contains("ps--active-y");
  }

  return false;
};
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
  box-sizing: border-box;

  &.popup {
    box-shadow: none;
    padding: 0 23px;
  }
}

.verify-transaction {
  width: 100%;
  height: 100%;
  box-sizing: border-box;

  &__header {
    position: relative;
    padding: 24px 72px 12px 32px;

    &.popup {
      padding: 24px 0 12px 0;
    }

    h3 {
      font-style: normal;
      font-weight: 700;
      font-size: 24px;
      line-height: 32px;
      color: @primaryLabel;
      margin: 0;
    }
  }

  &__close {
    position: absolute;
    top: 20px;
    right: 24px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 300ms ease-in-out;

    &:hover {
      background: @black007;
    }
  }

  &__description {
    font-style: normal;
    font-weight: 400;
    font-size: 16px;
    line-height: 24px;
    color: @secondaryLabel;
    padding: 4px 141px 16px 32px;
    margin: 0;

    &.popup {
      padding: 4px 0 16px 0;
    }
  }

  &__info {
    border: 1px solid @gray02;
    box-sizing: border-box;
    border-radius: 10px;
    margin: 0 32px 0 32px;

    &.popup {
      margin: 0;
      margin-bottom: 56px;
    }
  }

  &__buttons {
    position: absolute;
    left: 0;
    bottom: 0;
    padding: 8px 32px 32px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-direction: row;
    width: 100%;
    box-sizing: border-box;
    font-size: 0;

    &.popup {
      padding: 24px;
      background: @white;
    }

    &.border {
      box-shadow: 0px 0px 6px rgba(0, 0, 0, 0.05),
        0px 0px 1px rgba(0, 0, 0, 0.25);
    }

    &-cancel {
      width: 170px;
    }

    &-send {
      width: 218px;
    }
  }

  &__scroll-area {
    position: relative;
    margin: auto;
    width: calc(~"100% + 53px");
    height: calc(~"100% - 88px");
    margin: 0;
    padding: 0 53px 0 0 !important;
    margin-right: -53px;
    box-sizing: border-box;

    &.ps--active-y {
      padding-bottom: 0 !important;
    }

    & > .ps__rail-y {
      right: 0 !important;
    }
  }

  &__error {
    position: absolute;
    top: 480px;
    width: 100%;
    background-color: white;
  }
}
</style>
