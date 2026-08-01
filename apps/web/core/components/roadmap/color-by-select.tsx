/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TRoadmapColorBy } from "@plane/types";
import { CustomSelect } from "@plane/ui";

const OPTIONS: { key: TRoadmapColorBy; i18n_label: string }[] = [
  { key: "priority", i18n_label: "roadmap.color_by.priority" },
  { key: "health", i18n_label: "roadmap.color_by.health" },
];

type Props = {
  value: TRoadmapColorBy;
  onChange: (value: TRoadmapColorBy) => void;
};

export function RoadmapColorBySelect(props: Props) {
  const { value, onChange } = props;
  const { t } = useTranslation();

  const selected = OPTIONS.find((option) => option.key === value) ?? OPTIONS[0];

  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      input
      buttonClassName="rounded-md !border-subtle font-medium !shadow-none"
      label={
        <span className="flex items-center gap-1.5 text-13">
          <span className="text-secondary">{t("roadmap.color_by.label")}:</span> {t(selected.i18n_label)}
        </span>
      }
    >
      {OPTIONS.map((option) => (
        <CustomSelect.Option key={option.key} value={option.key}>
          {t(option.i18n_label)}
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
}
