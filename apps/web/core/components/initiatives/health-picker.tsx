/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { AtRiskIcon, OffTrackIcon, OnTrackIcon } from "@plane/propel/icons";
import type { TInitiativeHealth } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";

export const HEALTH_OPTIONS: { key: TInitiativeHealth; i18n_label: string; Icon: typeof OnTrackIcon }[] = [
  { key: "on-track", i18n_label: "initiatives.health.on_track", Icon: OnTrackIcon },
  { key: "at-risk", i18n_label: "initiatives.health.at_risk", Icon: AtRiskIcon },
  { key: "off-track", i18n_label: "initiatives.health.off_track", Icon: OffTrackIcon },
];

type Props = {
  value: TInitiativeHealth | null | undefined;
  onChange: (value: TInitiativeHealth | null) => void;
  disabled?: boolean;
  buttonClassName?: string;
};

export function HealthPicker(props: Props) {
  const { value, onChange, disabled = false, buttonClassName } = props;
  const { t } = useTranslation();

  const selected = HEALTH_OPTIONS.find((option) => option.key === value);

  return (
    <CustomSelect
      value={value ?? null}
      onChange={onChange}
      disabled={disabled}
      input
      buttonClassName={cn("rounded-md !border-subtle font-medium !shadow-none", buttonClassName)}
      label={
        <div className="flex items-center gap-1.5">
          {selected ? (
            <>
              <selected.Icon width="14" height="14" />
              {t(selected.i18n_label)}
            </>
          ) : (
            <span className="text-placeholder">{t("initiatives.health.no_status")}</span>
          )}
        </div>
      }
    >
      <CustomSelect.Option value={null}>
        <span className="text-placeholder">{t("initiatives.health.no_status")}</span>
      </CustomSelect.Option>
      {HEALTH_OPTIONS.map((option) => (
        <CustomSelect.Option key={option.key} value={option.key}>
          <div className="flex items-center gap-2">
            <option.Icon width="14" height="14" />
            {t(option.i18n_label)}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
}
