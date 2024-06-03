<template>
  <div :class="getClass($props)">
    <alert-icon v-if="errorMsg" />
    <info-icon v-if="!errorMsg && infoMsg" />

    <p v-html="errorMsg || infoMsg"></p>
  </div>
</template>

<script setup lang="ts">
import AlertIcon from "@action/icons/send/alert-icon.vue";
import InfoIcon from "@action/icons/common/info-icon-gray.vue";

interface IProps {
  infoMsg?: string;
  errorMsg?: string;
}

defineProps<IProps>();

function getClass(props: IProps) {
  let color = "";

  if (props.errorMsg) {
    color = "error";
  } else if (props.infoMsg) {
    color = "info";
  }

  return `send-alert ${color}`;
}
</script>

<style lang="less">
@import "~@action/styles/theme.less";

.send-alert {
  margin: 0 32px 8px 32px;
  border-radius: 10px;
  padding: 12px 16px 12px 57px;
  position: relative;
  box-sizing: border-box;

  svg {
    position: absolute;
    left: 16px;
    top: 50%;
    margin-top: -12px;
  }

  p {
    font-weight: 400;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.25px;
    margin: 0;

    a {
      &:hover {
        text-decoration: none;
      }
    }
  }
}

.send-alert.info {
  background: @gray02;

  p {
    color: @black;
  }

  a {
    color: @black;
  }
}

.send-alert.error {
  background: @error01;

  p {
    color: @error;
  }

  a {
    color: @error;
  }
}
</style>
