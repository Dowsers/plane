/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIntakeForm } from "@plane/types";
import { Button, Checkbox, EModalPosition, EModalWidth, Input, ModalCore, ToggleSwitch } from "@plane/ui";
// components
import { LabelDropdown } from "@/components/issues/issue-layouts/properties/label-dropdown";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
// services
import { IntakeFormService } from "@/services/inbox";

const intakeFormService = new IntakeFormService();

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  form: TIntakeForm | null;
  onSaved: () => void;
};

const DEFAULTS: Partial<TIntakeForm> = {
  name: "",
  description_html: "",
  show_priority_field: true,
  show_labels_field: true,
  require_submitter_name: false,
  require_submitter_email: false,
  success_message: "Thank you, your submission has been received.",
  redirect_url: null,
  rate_limit_per_ip_per_hour: 10,
  default_labels: [],
  default_priority: null,
  default_state: null,
};

export const IntakeFormFormModal = observer(function IntakeFormFormModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, form, onSaved } = props;

  const [values, setValues] = useState<Partial<TIntakeForm>>(DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValues(form ?? DEFAULTS);
  }, [form, isOpen]);

  const handleSave = async () => {
    if (!values.name?.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Le nom du formulaire est requis." });
      return;
    }

    const payload = {
      name: values.name.trim(),
      description_html: values.description_html ?? "",
      show_priority_field: !!values.show_priority_field,
      show_labels_field: !!values.show_labels_field,
      require_submitter_name: !!values.require_submitter_name,
      require_submitter_email: !!values.require_submitter_email,
      default_state: values.default_state ?? null,
      default_priority: values.default_priority ?? null,
      default_labels: values.default_labels ?? [],
      success_message: values.success_message ?? DEFAULTS.success_message,
      redirect_url: values.redirect_url || null,
      rate_limit_per_ip_per_hour: values.rate_limit_per_ip_per_hour ?? 10,
    };

    setIsSaving(true);
    try {
      if (form) {
        await intakeFormService.update(workspaceSlug, projectId, form.id, payload);
      } else {
        await intakeFormService.create(workspaceSlug, projectId, payload);
      }
      onSaved();
      handleClose();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: error?.error ?? "Unable to save the form." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">
            {form ? "Modifier le formulaire" : "Nouveau formulaire web"}
          </h4>
          <button onClick={handleClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5">
          <Input
            type="text"
            placeholder="Nom interne du formulaire"
            value={values.name ?? ""}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            inputSize="sm"
          />
          <textarea
            placeholder="Description affichée publiquement (HTML simple)"
            value={values.description_html ?? ""}
            onChange={(e) => setValues({ ...values, description_html: e.target.value })}
            rows={3}
            className="w-full rounded-md border-[0.5px] border-subtle-1 bg-layer-2 p-2 text-13 focus:outline-none"
          />

          <div className="flex items-center gap-1.5 text-13 text-secondary">
            <ToggleSwitch
              value={!!values.show_priority_field}
              onChange={() => setValues({ ...values, show_priority_field: !values.show_priority_field })}
            />
            Afficher le champ priorité
          </div>
          <div className="flex items-center gap-1.5 text-13 text-secondary">
            <ToggleSwitch
              value={!!values.show_labels_field}
              onChange={() => setValues({ ...values, show_labels_field: !values.show_labels_field })}
            />
            Afficher le champ labels
          </div>
          <label
            htmlFor="intake-form-require-submitter-name"
            className="flex items-center gap-1.5 text-13 text-secondary"
          >
            <Checkbox
              id="intake-form-require-submitter-name"
              checked={!!values.require_submitter_name}
              onChange={(e) => setValues({ ...values, require_submitter_name: e.target.checked })}
            />
            Nom du soumetteur requis
          </label>
          <label
            htmlFor="intake-form-require-submitter-email"
            className="flex items-center gap-1.5 text-13 text-secondary"
          >
            <Checkbox
              id="intake-form-require-submitter-email"
              checked={!!values.require_submitter_email}
              onChange={(e) => setValues({ ...values, require_submitter_email: e.target.checked })}
            />
            Email du soumetteur requis
          </label>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="mb-1 text-13 text-secondary">État par défaut</p>
              <StateDropdown
                projectId={projectId}
                value={values.default_state ?? null}
                onChange={(val) => setValues({ ...values, default_state: val })}
                buttonVariant="border-with-text"
              />
            </div>
            <div className="flex-1">
              <p className="mb-1 text-13 text-secondary">Labels par défaut</p>
              <LabelDropdown
                projectId={projectId}
                value={values.default_labels ?? []}
                onChange={(val) => setValues({ ...values, default_labels: val })}
                label={<span>{(values.default_labels ?? []).length} label(s)</span>}
              />
            </div>
          </div>

          <Input
            type="text"
            placeholder="Message de succès"
            value={values.success_message ?? ""}
            onChange={(e) => setValues({ ...values, success_message: e.target.value })}
            inputSize="sm"
          />
          <Input
            type="url"
            placeholder="URL de redirection après soumission (optionnel)"
            value={values.redirect_url ?? ""}
            onChange={(e) => setValues({ ...values, redirect_url: e.target.value })}
            inputSize="sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-13 text-secondary">Limite par IP :</span>
            <Input
              type="number"
              min={1}
              max={1000}
              inputSize="sm"
              className="w-20"
              value={values.rate_limit_per_ip_per_hour ?? 10}
              onChange={(e) => setValues({ ...values, rate_limit_per_ip_per_hour: Number(e.target.value) })}
            />
            <span className="text-13 text-secondary">soumissions / heure</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSaving}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            Enregistrer
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
