<script setup lang="ts">
import type { NavGroup } from './types'

import NavTeamCollapsible from './nav-team-collapsible.vue'

const { navMain } = defineProps<{
  navMain: NavGroup[]
}>()
</script>

<template>
  <NavTeamCollapsible :nav-main="navMain" />
</template>