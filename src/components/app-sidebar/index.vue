<script setup lang="ts">
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from '@/components/ui/sidebar'

import { sidebarData } from './data/sidebar-data'
import BrandMenu from './nav-footer.vue'
import NavTeam from './nav-team.vue'
</script>

<template>
  <Sidebar collapsible="icon" class="z-50">
    <SidebarHeader class="border-b py-1 group-data-[collapsible=icon]:justify-center">
      <BrandMenu />
    </SidebarHeader>

    <SidebarContent>
      <NavTeam :nav-main="sidebarData.navMain" />
    </SidebarContent>

    <SidebarRail />
  </Sidebar>
</template>