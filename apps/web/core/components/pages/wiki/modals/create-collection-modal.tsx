/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Folder } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmojiIconPickerTypes, EmojiPicker, Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TLogoProps, TPageCollection } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// plane web hooks
import { usePageCollectionStore } from "@/plane-web/hooks/store";
// store
import { WIKI_COLLECTION_MAX_DEPTH } from "@/store/pages/page-collection.store";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  /** The Collection this new/edited Collection lives directly under (`null` = Wiki root). */
  parentId: string | null;
  /** When set, the modal edits (renames/re-icons) this Collection instead of creating a new one. */
  collectionToEdit?: TPageCollection;
};

export const CreateCollectionModal = observer(function CreateCollectionModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, parentId, collectionToEdit } = props;
  // states
  const [name, setName] = useState(collectionToEdit?.name ?? "");
  const [logoProps, setLogoProps] = useState<TLogoProps | undefined>(collectionToEdit?.logo_props);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { createCollection, updateCollection, getCollectionDepth } = usePageCollectionStore();
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setName(collectionToEdit?.name ?? "");
      setLogoProps(collectionToEdit?.logo_props);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, collectionToEdit?.id]);

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;

    // Exigence 3 - block the max-depth-3 violation client-side too, not
    // only relying on the server's 400 (the server remains the backstop
    // for the parent-based check below, e.g. concurrent edits).
    if (!collectionToEdit && getCollectionDepth(parentId) >= WIKI_COLLECTION_MAX_DEPTH) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("wiki.toast.max_depth_error"),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (collectionToEdit) {
        await updateCollection(workspaceSlug, collectionToEdit.id, { name: name.trim(), logo_props: logoProps });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("wiki.toast.folder_update_success"),
        });
      } else {
        await createCollection(workspaceSlug, { name: name.trim(), logo_props: logoProps, parent: parentId });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("wiki.toast.folder_create_success"),
        });
      }
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error || t("wiki.toast.folder_error"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className="space-y-5 p-5">
          <h3 className="text-18 font-medium text-secondary">
            {collectionToEdit ? t("wiki.folder_form.rename_title") : t("wiki.folder_form.create_title")}
          </h3>
          <div className="flex h-9 w-full items-start gap-2">
            <EmojiPicker
              isOpen={isEmojiPickerOpen}
              handleToggle={setIsEmojiPickerOpen}
              className="flex flex-shrink-0 items-center justify-center"
              buttonClassName="flex items-center justify-center bg-layer-2 hover:bg-layer-2-hover rounded-md"
              label={
                <span className="grid h-9 w-9 place-items-center rounded-md">
                  {logoProps?.in_use ? (
                    <Logo logo={logoProps} size={18} type="lucide" />
                  ) : (
                    <Folder className="h-4 w-4 text-tertiary" />
                  )}
                </span>
              }
              onChange={(val: any) => {
                let logoValue = {};
                if (val?.type === "emoji") logoValue = { value: val.value, url: undefined };
                else if (val?.type === "icon") logoValue = val.value;
                setLogoProps({ in_use: val?.type, [val?.type]: logoValue });
                setIsEmojiPickerOpen(false);
              }}
              defaultOpen={logoProps?.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
            />
            <div className="flew-grow w-full space-y-1">
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("wiki.folder_form.name_placeholder")}
                className="w-full resize-none text-14"
                required
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} disabled={!name.trim()}>
            {collectionToEdit ? t("save") : t("create_folder")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
