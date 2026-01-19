<template>
  <div class="w-[300px] min-h-[200px] bg-gradient-to-br from-purple-600 to-purple-800 text-white">
    <div class="p-5 text-center">
      <h1 class="text-lg font-semibold mb-4">
        Meet Transcript Bridge
      </h1>
      <p class="text-sm leading-relaxed mb-2">
        Hello World with Vue 3! 🎉
      </p>
      <p class="text-xs opacity-80 mt-4">
        Version {{ version }}
      </p>
      <div class="mt-4 text-xs opacity-60">
        <p>Vue: {{ vueVersion }}</p>
        <p>Chrome API: {{ chromeApiAvailable ? '✅' : '❌' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { version as vueVersion } from 'vue';

const version = ref('0.1.0');
const chromeApiAvailable = ref(false);

onMounted(() => {
  // Chrome Extension API の動作確認
  if (chrome?.storage) {
    chromeApiAvailable.value = true;
    console.log('Chrome Extension API is available');
  }
});
</script>
