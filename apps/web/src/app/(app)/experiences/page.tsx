"use client";

import { PageHeader } from "@/components/task-list";
import { LifeMap } from "@/components/life-map";

export default function ExperiencesPage() {
  return (
    <div>
      <PageHeader
        title="Life experiences"
        subtitle="The horizon above your goals — what you want to have lived, and in which years of your life"
      />
      <LifeMap />
    </div>
  );
}
