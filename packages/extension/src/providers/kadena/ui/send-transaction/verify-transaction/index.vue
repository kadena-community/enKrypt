<template>
  <div>
    <verify-normal-transaction
      v-if="txData.transactionType === TransactionType.normal"
    />
    <verify-normal-transaction
      v-if="txData.transactionType === TransactionType.finish_crosschain"
    />
  </div>
</template>

<script setup lang="ts">
import VerifyNormalTransaction from "./verify-normal-transaction.vue";
import VerifyFinishCrosschainTransaction from "./verify-finish-crosschain-transaction.vue";
import { TransactionType } from "../../types";
import { useRoute } from "vue-router";

const route = useRoute();

const txData: VerifyTransactionParams = JSON.parse(
  Buffer.from(route.query.txData as string, "base64").toString("utf8")
);
</script>
