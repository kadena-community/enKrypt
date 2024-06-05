<template>
  <div class="cross-chain-alert">
    <cross-chain-icon />

    <p>
      This will be a cross-chain transaction from chain {{ fromChainId }} to
      chain {{ toChainId }}.
      <a
        href="https://docs.kadena.io/learn/accounts#transfers-within-and-between-chainsh1647261648"
        target="_blank"
      >
        Learn more
      </a>
      .
    </p>
  </div>
</template>

<script setup lang="ts">
import CrossChainIcon from "@action/icons/common/cross-chain.vue";

interface IProps {
  fromChainId: string;
  toChainId: string;
}

defineProps<IProps>();
</script>

<style lang="less">
@import "~@action/styles/theme.less";

.cross-chain-alert {
  margin: 0 32px 8px 32px;
  padding: 12px 16px 12px 57px;
  position: relative;

  svg {
    position: absolute;
    left: 16px;
    top: 50%;
    margin-top: -12px;
    fill: @primary;
  }

  p {
    color: @primary;
    font-weight: 400;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.25px;
    margin: 0;

    a {
      color: @primary;

      &:hover {
        text-decoration: none;
      }
    }
  }
}
</style>
