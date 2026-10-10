<script setup lang="ts">
import logoUrl from '@/assets/logo-app.png'

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton size="lg" class="pointer-events-none">
        <img
          :src="logoUrl"
          alt=""
          class="size-7 shrink-0 rounded-full object-cover ring-1 ring-border"
        />
        <span class="font-semibold truncate">vLLM 控制台</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>