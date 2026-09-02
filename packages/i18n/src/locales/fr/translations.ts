/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export default {
  sidebar: {
    projects: "Projets",
    pages: "Pages",
    new_work_item: "Nouvel élément de travail",
    home: "Accueil",
    your_work: "Votre travail",
    inbox: "Boîte de réception",
    workspace: "Espace de travail",
    views: "Vues",
    analytics: "Analyses",
    work_items: "Éléments de travail",
    cycles: "Cycles",
    modules: "Modules",
    intake: "Intake",
    drafts: "Brouillons",
    favorites: "Favoris",
    pro: "Pro",
    upgrade: "Mettre à niveau",
    stickies: "Post-it",
    customers: "Clients",
    dashboards: "Tableaux de bord",
    initiatives: "Initiatives",
    milestones: "Jalons",
    roadmap: "Feuille de route",
    updates: "Mises à jour",
    aria: {
      main_sidebar: "Barre latérale principale",
      peek_view: "Aperçu de la barre latérale",
      resize: "Redimensionner la barre latérale",
    },
  },
  auth: {
    common: {
      email: {
        label: "E-mail",
        placeholder: "nom@entreprise.com",
        errors: {
          required: "L’e-mail est requis",
          invalid: "L’e-mail est invalide",
        },
      },
      password: {
        label: "Mot de passe",
        set_password: "Définir un mot de passe",
        placeholder: "Entrer le mot de passe",
        confirm_password: {
          label: "Confirmer le mot de passe",
          placeholder: "Confirmer le mot de passe",
        },
        current_password: {
          label: "Mot de passe actuel",
        },
        new_password: {
          label: "Nouveau mot de passe",
          placeholder: "Entrer le nouveau mot de passe",
        },
        change_password: {
          label: {
            default: "Changer le mot de passe",
            submitting: "Changement du mot de passe",
          },
        },
        errors: {
          match: "Les mots de passe ne correspondent pas",
          empty: "Veuillez entrer votre mot de passe",
          length: "Le mot de passe doit contenir plus de 8 caractères",
          strength: {
            weak: "Le mot de passe est faible",
            strong: "Le mot de passe est fort",
          },
        },
        submit: "Définir le mot de passe",
        toast: {
          change_password: {
            success: {
              title: "Succès !",
              message: "Mot de passe changé avec succès.",
            },
            error: {
              title: "Erreur !",
              message: "Une erreur s'est produite. Veuillez réessayer.",
            },
          },
        },
      },
      unique_code: {
        label: "Code unique",
        placeholder: "123456",
        paste_code: "Collez le code envoyé à votre e-mail",
        requesting_new_code: "Demande d’un nouveau code",
        sending_code: "Envoi du code",
      },
      already_have_an_account: "Vous avez déjà un compte ?",
      login: "Se connecter",
      create_account: "Créer un compte",
      new_to_plane: "Nouveau sur Plane ?",
      back_to_sign_in: "Retour à la connexion",
      resend_in: "Renvoyer dans {seconds} secondes",
      sign_in_with_unique_code: "Se connecter avec un code unique",
      forgot_password: "Mot de passe oublié ?",
    },
    sign_up: {
      header: {
        label: "Créez un compte pour commencer à gérer le travail avec votre équipe.",
        step: {
          email: {
            header: "S’inscrire",
            sub_header: "",
          },
          password: {
            header: "S’inscrire",
            sub_header: "Inscrivez-vous en utilisant une combinaison e-mail-mot de passe.",
          },
          unique_code: {
            header: "S’inscrire",
            sub_header: "Inscrivez-vous en utilisant un code unique envoyé à l’adresse e-mail ci-dessus.",
          },
        },
      },
      errors: {
        password: {
          strength: "Essayez de définir un mot de passe fort pour continuer",
        },
      },
    },
    sign_in: {
      header: {
        label: "Connectez-vous pour commencer à gérer le travail avec votre équipe.",
        step: {
          email: {
            header: "Se connecter ou s’inscrire",
            sub_header: "",
          },
          password: {
            header: "Se connecter ou s’inscrire",
            sub_header: "Utilisez votre combinaison e-mail - mot de passe pour vous connecter.",
          },
          unique_code: {
            header: "Se connecter ou s’inscrire",
            sub_header: "Connectez-vous en utilisant un code unique envoyé à l’adresse e-mail ci-dessus.",
          },
        },
      },
    },
    forgot_password: {
      title: "Réinitialiser votre mot de passe",
      description:
        "Entrez l’adresse e-mail vérifiée de votre compte utilisateur et nous vous enverrons un lien de réinitialisation du mot de passe.",
      email_sent: "Nous avons envoyé le lien de réinitialisation à votre adresse e-mail",
      send_reset_link: "Envoyer le lien de réinitialisation",
      errors: {
        smtp_not_enabled:
          "Nous constatons que votre administrateur n’a pas activé le SMTP, nous ne pourrons pas envoyer de lien de réinitialisation du mot de passe",
      },
      toast: {
        success: {
          title: "E-mail envoyé",
          message:
            "Consultez votre boîte de réception pour obtenir un lien de réinitialisation de votre mot de passe. S’il n’apparaît pas dans quelques minutes, vérifiez votre dossier spam.",
        },
        error: {
          title: "Erreur !",
          message: "Une erreur s’est produite. Veuillez réessayer.",
        },
      },
    },
    reset_password: {
      title: "Définir un nouveau mot de passe",
      description: "Sécurisez votre compte avec un mot de passe fort",
    },
    set_password: {
      title: "Sécurisez votre compte",
      description: "La définition d’un mot de passe vous permet de vous connecter en toute sécurité",
    },
    sign_out: {
      toast: {
        error: {
          title: "Erreur !",
          message: "Échec de la déconnexion. Veuillez réessayer.",
        },
      },
    },
    saml: {
      use_different_email: "Utiliser une autre adresse e-mail",
      sso_required_notice: "Votre organisation exige de vous connecter via",
      continue_with: "Continuer avec {name}",
    },
  },
  submit: "Valider",
  contact_support: "Contacter le support",
  cancel: "Annuler",
  loading: "Chargement",
  error: "Erreur",
  success: "Succès",
  warning: "Avertissement",
  info: "Info",
  close: "Fermer",
  yes: "Oui",
  no: "Non",
  ok: "OK",
  name: "Nom",
  description: "Description",
  search: "Rechercher",
  add_member: "Ajouter un membre",
  adding_members: "Ajout de membres",
  remove_member: "Supprimer le membre",
  add_members: "Ajouter des membres",
  adding_member: "Ajout de membres",
  remove_members: "Supprimer des membres",
  add: "Ajouter",
  adding: "Ajout",
  remove: "Supprimer",
  add_new: "Ajouter nouveau",
  remove_selected: "Supprimer la sélection",
  first_name: "Prénom",
  last_name: "Nom",
  email: "E-mail",
  display_name: "Nom d'affichage",
  role: "Rôle",
  timezone: "Fuseau horaire",
  avatar: "Avatar",
  cover_image: "Image de couverture",
  password: "Mot de passe",
  change_cover: "Changer la couverture",
  language: "Langue",
  saving: "Enregistrement",
  save_changes: "Enregistrer les modifications",
  deactivate_account: "Désactiver le compte",
  deactivate_account_description:
    "Lors de la désactivation d'un compte, toutes les données et ressources de ce compte seront définitivement supprimées et ne pourront pas être récupérées.",
  profile_settings: "Paramètres du profil",
  your_account: "Votre compte",
  security: "Sécurité",
  activity: "Activité",
  appearance: "Apparence",
  notifications: "Notifications",
  workspaces: "Espaces de travail",
  create_workspace: "Créer un espace de travail",
  invitations: "Invitations",
  summary: "Résumé",
  assigned: "Assigné",
  created: "Créé",
  subscribed: "Abonné",
  you_do_not_have_the_permission_to_access_this_page: "Vous n’avez pas la permission d’accéder à cette page.",
  something_went_wrong_please_try_again: "Une erreur s’est produite. Veuillez réessayer.",
  load_more: "Charger davantage",
  select_or_customize_your_interface_color_scheme:
    "Sélectionnez ou personnalisez votre palette de couleurs de l’interface.",
  theme: "Thème",
  system_preference: "Préférence système",
  light: "Clair",
  dark: "Sombre",
  light_contrast: "Contraste élevé clair",
  dark_contrast: "Contraste élevé sombre",
  custom: "Thème personnalisé",
  select_your_theme: "Sélectionnez votre thème",
  customize_your_theme: "Personnalisez votre thème",
  background_color: "Couleur de fond",
  text_color: "Couleur du texte",
  primary_color: "Couleur principale (Thème)",
  sidebar_background_color: "Couleur de fond de la barre latérale",
  sidebar_text_color: "Couleur du texte de la barre latérale",
  set_theme: "Définir le thème",
  enter_a_valid_hex_code_of_6_characters: "Entrez un code hexadécimal valide de 6 caractères",
  background_color_is_required: "La couleur de fond est requise",
  text_color_is_required: "La couleur du texte est requise",
  primary_color_is_required: "La couleur principale est requise",
  sidebar_background_color_is_required: "La couleur de fond de la barre latérale est requise",
  sidebar_text_color_is_required: "La couleur du texte de la barre latérale est requise",
  updating_theme: "Mise à jour du thème",
  theme_updated_successfully: "Thème mis à jour avec succès",
  failed_to_update_the_theme: "Échec de la mise à jour du thème",
  email_notifications: "Notifications par e-mail",
  stay_in_the_loop_on_issues_you_are_subscribed_to_enable_this_to_get_notified:
    "Restez informé des éléments de travail auxquels vous êtes abonné. Activez ceci pour être notifié.",
  email_notification_setting_updated_successfully: "Paramètre de notification par e-mail mis à jour avec succès",
  failed_to_update_email_notification_setting: "Échec de la mise à jour du paramètre de notification par e-mail",
  notify_me_when: "Me notifier quand",
  property_changes: "Modifications des propriétés",
  property_changes_description:
    "Me notifier lorsque les propriétés des éléments de travail comme les acteurs, la priorité, les estimations ou autre changent.",
  state_change: "Changement d’état",
  state_change_description: "Me notifier lorsque les éléments de travail passent à un état différent",
  issue_completed: "Élément de travail terminé",
  issue_completed_description: "Me notifier uniquement lorsqu’un élément de travail est terminé",
  comments: "Commentaires",
  comments_description: "Me notifier lorsque quelqu’un laisse un commentaire sur l’élément de travail",
  mentions: "Mentions",
  mentions_description: "Me notifier uniquement lorsque quelqu’un me mentionne dans les commentaires ou la description",
  old_password: "Ancien mot de passe",
  general_settings: "Paramètres généraux",
  sign_out: "Se déconnecter",
  signing_out: "Déconnexion",
  active_cycles: "Cycles actifs",
  active_cycles_description:
    "Surveillez les cycles à travers les projets, suivez les éléments de travail prioritaires et zoomez sur les cycles qui nécessitent votre attention.",
  on_demand_snapshots_of_all_your_cycles: "Instantanés à la demande de tous vos cycles",
  upgrade: "Mettre à niveau",
  "10000_feet_view": "Vue à 10 000 pieds de tous les cycles actifs.",
  "10000_feet_view_description":
    "Dézoomez pour voir les cycles en cours dans tous vos projets en même temps au lieu de passer d’un cycle à l’autre dans chaque projet.",
  get_snapshot_of_each_active_cycle: "Obtenez un aperçu de chaque cycle actif.",
  get_snapshot_of_each_active_cycle_description:
    "Suivez les métriques de haut niveau pour tous les cycles actifs, suivez leur état d’avancement et évaluez leur impact par rapport aux échéances.",
  compare_burndowns: "Comparez les burndowns.",
  compare_burndowns_description:
    "Surveillez les performances de chacune de vos équipes en jetant un coup d’œil au rapport burndown de chaque cycle.",
  quickly_see_make_or_break_issues: "Repérez rapidement les éléments de travail critiques.",
  quickly_see_make_or_break_issues_description:
    "Prévisualisez les éléments de travail hautement prioritaires pour chaque cycle par rapport aux dates d’échéance. Visualisez-les pour chaque cycle en un clic.",
  zoom_into_cycles_that_need_attention: "Zoomez sur les cycles qui nécessitent votre attention.",
  zoom_into_cycles_that_need_attention_description:
    "Examinez l’état de tout cycle qui ne corresponde pas aux attentes en un clic.",
  stay_ahead_of_blockers: "Anticipez les blocages.",
  stay_ahead_of_blockers_description:
    "Repérez les défis d’un projet à l’autre et repérez les dépendances inter-cycles qui ne sont pas évidentes depuis une autre vue.",
  analytics: "Analyses",
  workspace_invites: "Invitations à l’espace de travail",
  enter_god_mode: "Entrer en mode dieu",
  workspace_logo: "Logo de l’espace de travail",
  new_issue: "Nouvel élément de travail",
  your_work: "Votre travail",
  drafts: "Brouillons",
  projects: "Projets",
  teams: {
    create_team: "Créer une équipe",
    delete_confirm: {
      description: "Êtes-vous sûr de vouloir supprimer cette équipe ? Cette action est irréversible.",
      title: "Supprimer l’équipe",
    },
    description: "Description",
    empty_state: {
      description: "Créez une équipe pour regrouper des membres et des projets.",
      title: "Aucune équipe pour le moment",
    },
    label: "Équipes",
    members: "Membres",
    name: "Nom",
    projects: "Projets",
    toast: {
      create_success: "Équipe créée avec succès",
      delete_success: "Équipe supprimée avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      update_success: "Équipe mise à jour avec succès",
    },
    update_team: "Mettre à jour l’équipe",
  },
  views: "Vues",
  workspace: "Espace de travail",
  archives: "Archives",
  settings: "Paramètres",
  failed_to_move_favorite: "Échec du déplacement du favori",
  favorites: "Favoris",
  no_favorites_yet: "Pas encore de favoris",
  create_folder: "Créer un dossier",
  new_folder: "Nouveau dossier",
  favorite_updated_successfully: "Favori mis à jour avec succès",
  favorite_created_successfully: "Favori créé avec succès",
  folder_already_exists: "Le dossier existe déjà",
  folder_name_cannot_be_empty: "Le nom du dossier ne peut pas être vide",
  something_went_wrong: "Une erreur s’est produite",
  failed_to_reorder_favorite: "Échec de la réorganisation du favori",
  favorite_removed_successfully: "Favori supprimé avec succès",
  failed_to_create_favorite: "Échec de la création du favori",
  failed_to_rename_favorite: "Échec du renommage du favori",
  project_link_copied_to_clipboard: "Lien du projet copié dans le presse-papiers",
  link_copied: "Lien copié",
  add_project: "Ajouter un projet",
  create_project: "Créer un projet",
  failed_to_remove_project_from_favorites: "Impossible de supprimer le projet des favoris. Veuillez réessayer.",
  project_created_successfully: "Projet créé avec succès",
  project_created_successfully_description:
    "Projet créé avec succès. Vous pouvez maintenant commencer à ajouter des éléments de travail.",
  project_name_already_taken: "Le nom du projet est déjà pris.",
  project_identifier_already_taken: "L’identifiant du projet est déjà pris.",
  project_cover_image_alt: "Image de couverture du projet",
  name_is_required: "Le nom est requis",
  title_should_be_less_than_255_characters: "Le titre doit faire moins de 255 caractères",
  project_name: "Nom du projet",
  project_id_must_be_at_least_1_character: "L’ID du projet doit comporter au moins 1 caractère",
  project_id_must_be_at_most_5_characters: "L’ID du projet doit comporter au plus 5 caractères",
  project_id: "ID du projet",
  project_id_tooltip_content:
    "Vous aide à identifier de manière unique les éléments de travail dans le projet. Maximum 10 caractères.",
  description_placeholder: "Description",
  only_alphanumeric_non_latin_characters_allowed: "Seuls les caractères alphanumériques et non latins sont autorisés.",
  project_id_is_required: "L’ID du projet est requis",
  project_id_allowed_char: "Seuls les caractères alphanumériques et non latins sont autorisés.",
  project_id_min_char: "L’ID du projet doit comporter au moins 1 caractère",
  project_id_max_char: "L'ID du projet doit comporter au plus 10 caractères",
  project_description_placeholder: "Entrez la description du projet",
  select_network: "Sélectionner le réseau",
  lead: "Responsable",
  date_range: "Plage de dates",
  private: "Privé",
  public: "Public",
  accessible_only_by_invite: "Accessible uniquement sur invitation",
  anyone_in_the_workspace_except_guests_can_join:
    "Tout le monde dans l’espace de travail peut rejoindre, sauf les invités",
  creating: "Création",
  creating_project: "Création du projet",
  adding_project_to_favorites: "Ajout du projet aux favoris",
  project_added_to_favorites: "Projet ajouté aux favoris",
  couldnt_add_the_project_to_favorites: "Impossible d’ajouter le projet aux favoris. Veuillez réessayer.",
  removing_project_from_favorites: "Suppression du projet des favoris",
  project_removed_from_favorites: "Projet supprimé des favoris",
  couldnt_remove_the_project_from_favorites: "Impossible de supprimer le projet des favoris. Veuillez réessayer.",
  add_to_favorites: "Ajouter aux favoris",
  remove_from_favorites: "Supprimer des favoris",
  publish_project: "Publier le projet",
  publish: "Publier",
  copy_link: "Copier le lien",
  leave_project: "Quitter le projet",
  join_the_project_to_rearrange: "Rejoignez le projet pour réorganiser",
  drag_to_rearrange: "Glisser pour réorganiser",
  congrats: "Félicitations !",
  open_project: "Ouvrir le projet",
  issues: "Éléments de travail",
  cycles: "Cycles",
  modules: "Modules",
  pages: "Pages",
  intake: "Intake",
  time_tracking: "Suivi du temps",
  work_management: "Organisation du travail",
  projects_and_issues: "Projets et éléments de travail",
  projects_and_issues_description: "Activez ou désactivez ces éléments pour ce projet.",
  cycles_description:
    "Définissez un cadre temporel pour chaque projet et ajustez la durée selon les besoins. Un cycle peut durer deux semaines, le suivant une semaine.",
  modules_description: "Organisez le travail en sous-projets avec des responsables et des acteurs spécifiques.",
  views_description:
    "Enregistrez des tris, filtres et options d’affichage personnalisés ou partagez-les avec votre équipe.",
  pages_description: "Créez et modifiez du contenu libre : notes, documents, tout ce que vous voulez.",
  intake_description:
    "Permettez aux non-membres de partager des bugs, des retours et des suggestions, sans perturber votre flux de travail.",
  time_tracking_description: "Enregistrez le temps passé sur les éléments de travail et les projets.",
  work_management_description: "Gérez votre travail et vos projets facilement.",
  documentation: "Documentation",
  contact_sales: "Contacter les ventes",
  hyper_mode: "Mode Hyper",
  keyboard_shortcuts: "Raccourcis clavier",
  whats_new: "Quoi de neuf ?",
  version: "Version",
  we_are_having_trouble_fetching_the_updates: "Nous avons des difficultés à récupérer les mises à jour.",
  our_changelogs: "nos journaux des modifications",
  for_the_latest_updates: "pour les dernières mises à jour.",
  please_visit: "Veuillez visiter",
  docs: "Documentation",
  full_changelog: "Journal des modifications complet",
  support: "Support",
  forum: "Forum",
  powered_by_plane_pages: "Propulsé par Plane Pages",
  please_select_at_least_one_invitation: "Veuillez sélectionner au moins une invitation.",
  please_select_at_least_one_invitation_description:
    "Veuillez sélectionner au moins une invitation pour rejoindre l’espace de travail.",
  we_see_that_someone_has_invited_you_to_join_a_workspace:
    "Nous voyons que quelqu’un vous a invité à rejoindre un espace de travail",
  join_a_workspace: "Rejoindre un espace de travail",
  we_see_that_someone_has_invited_you_to_join_a_workspace_description:
    "Nous voyons que quelqu’un vous a invité à rejoindre un espace de travail",
  join_a_workspace_description: "Rejoindre un espace de travail",
  accept_and_join: "Accepter et rejoindre",
  go_home: "Aller à l’accueil",
  no_pending_invites: "Aucune invitation en attente",
  you_can_see_here_if_someone_invites_you_to_a_workspace:
    "Vous pouvez voir ici si quelqu’un vous invite à un espace de travail",
  back_to_home: "Retour à l’accueil",
  workspace_name: "nom-espace-de-travail",
  deactivate_your_account: "Désactiver votre compte",
  deactivate_your_account_description:
    "Une fois votre compte désactivé, vous ne pourrez plus être associé à des éléments de travail ni être facturé pour votre espace de travail. Pour réactiver votre compte, vous aurez besoin d'une invitation à un espace de travail avec cette adresse e-mail.",
  deactivating: "Désactivation",
  confirm: "Confirmer",
  confirming: "Confirmation",
  draft_created: "Brouillon créé",
  issue_created_successfully: "Élément de travail créé avec succès",
  draft_creation_failed: "Échec de la création du brouillon",
  issue_creation_failed: "Échec de la création de l’élément de travail",
  draft_issue: "Élément de travail en brouillon",
  issue_updated_successfully: "Élément de travail mis à jour avec succès",
  issue_could_not_be_updated: "L’élément de travail n’a pas pu être mis à jour",
  create_a_draft: "Créer un brouillon",
  save_to_drafts: "Enregistrer dans les brouillons",
  save: "Enregistrer",
  update: "Mettre à jour",
  updating: "Mise à jour",
  create_new_issue: "Créer un nouvel élément de travail",
  editor_is_not_ready_to_discard_changes: "L’éditeur n’est pas prêt à annuler les modifications",
  failed_to_move_issue_to_project: "Échec du déplacement de l’élément de travail vers le projet",
  create_more: "Créer plus",
  add_to_project: "Ajouter au projet",
  discard: "Annuler",
  duplicate_issue_found: "Élément de travail en double trouvé",
  duplicate_issues_found: "Éléments de travail en double trouvés",
  no_matching_results: "Aucun résultat correspondant",
  title_is_required: "Le titre est requis",
  title: "Titre",
  state: "État",
  priority: "Priorité",
  none: "Aucun",
  urgent: "Urgent",
  high: "Élevé",
  medium: "Moyen",
  low: "Faible",
  members: "Membres",
  assignee: "Acteur",
  assignees: "Acteurs",
  you: "Vous",
  labels: "Étiquettes",
  create_new_label: "Créer une nouvelle étiquette",
  start_date: "Date de début",
  end_date: "Date de fin",
  due_date: "Date d’échéance",
  estimate: "Estimation",
  change_parent_issue: "Changer l’élément de travail parent",
  remove_parent_issue: "Supprimer l’élément de travail parent",
  add_parent: "Ajouter un parent",
  loading_members: "Chargement des membres",
  view_link_copied_to_clipboard: "Lien de la vue copié dans le presse-papiers.",
  required: "Requis",
  optional: "Optionnel",
  Cancel: "Annuler",
  edit: "Modifier",
  archive: "Archiver",
  restore: "Restaurer",
  open_in_new_tab: "Ouvrir dans un nouvel onglet",
  delete: "Supprimer",
  deleting: "Suppression",
  make_a_copy: "Faire une copie",
  move_to_project: "Déplacer vers le projet",
  good: "Bonjour",
  morning: "matin",
  afternoon: "après-midi",
  evening: "soir",
  show_all: "Tout afficher",
  show_less: "Afficher moins",
  no_data_yet: "Pas encore de données",
  syncing: "Synchronisation",
  add_work_item: "Ajouter un élément de travail",
  advanced_description_placeholder: "Appuyez sur '/' pour voir les commandes",
  create_work_item: "Créer un élément de travail",
  attachments: "Pièces jointes",
  declining: "Refus",
  declined: "Refusé",
  decline: "Refuser",
  unassigned: "Non attribué",
  work_items: "Éléments de travail",
  add_link: "Ajouter un lien",
  points: "Points",
  no_assignee: "Pas d’acteurs associés",
  no_assignees_yet: "Pas encore d’acteurs associés",
  no_labels_yet: "Pas encore d’étiquettes",
  ideal: "Idéal",
  current: "Actuel",
  no_matching_members: "Aucun membre correspondant",
  leaving: "Départ",
  removing: "Suppression",
  leave: "Quitter",
  refresh: "Actualiser",
  refreshing: "Actualisation",
  refresh_status: "Actualiser l’état",
  prev: "Précédent",
  next: "Suivant",
  re_generating: "Régénération",
  re_generate: "Régénérer",
  re_generate_key: "Régénérer la clé",
  export: "Exporter",
  member: "{count, plural, one{# membre} other{# membres}}",
  new_password_must_be_different_from_old_password:
    "Le nouveau mot de passe doit être différent du mot de passe précédent",
  edited: "Modifié",
  bot: "Bot",
  project_view: {
    sort_by: {
      created_at: "Créé le",
      updated_at: "Mis à jour le",
      name: "Nom",
    },
  },
  toast: {
    success: "Succès !",
    error: "Erreur !",
  },
  links: {
    toasts: {
      created: {
        title: "Lien créé",
        message: "Le lien a été créé avec succès",
      },
      not_created: {
        title: "Lien non créé",
        message: "Le lien n’a pas pu être créé",
      },
      updated: {
        title: "Lien mis à jour",
        message: "Le lien a été mis à jour avec succès",
      },
      not_updated: {
        title: "Lien non mis à jour",
        message: "Le lien n’a pas pu être mis à jour",
      },
      removed: {
        title: "Lien supprimé",
        message: "Le lien a été supprimé avec succès",
      },
      not_removed: {
        title: "Lien non supprimé",
        message: "Le lien n’a pas pu être supprimé",
      },
    },
  },
  home: {
    empty: {
      quickstart_guide: "Guide de démarrage rapide",
      not_right_now: "Pas maintenant",
      create_project: {
        title: "Créer un projet",
        description: "La plupart des choses commencent par un projet dans Plane.",
        cta: "Commencer",
      },
      invite_team: {
        title: "Inviter votre équipe",
        description: "Construisez, déployez et travaillez avec vos collègues.",
        cta: "Les faire entrer",
      },
      configure_workspace: {
        title: "Configurez votre espace de travail.",
        description: "Activez ou désactivez des fonctionnalités ou allez plus loin.",
        cta: "Configurer cet espace de travail",
      },
      personalize_account: {
        title: "Faites de Plane le vôtre.",
        description: "Choisissez votre photo, vos couleurs et plus encore.",
        cta: "Personnaliser maintenant",
      },
      widgets: {
        title: "C'est calme sans widgets, activez-les",
        description:
          "Il semble que tous vos widgets soient désactivés. Activez-les\nmaintenant pour améliorer votre expérience !",
        primary_button: {
          text: "Gérer les widgets",
        },
      },
    },
    quick_links: {
      empty: "Enregistrez des liens vers des éléments de travail que vous souhaitez avoir à portée de main.",
      add: "Ajouter un lien rapide",
      title: "Lien rapide",
      title_plural: "Liens rapides",
    },
    recents: {
      title: "Récents",
      empty: {
        project: "Vos projets récents apparaîtront ici une fois que vous en aurez visité un.",
        page: "Vos pages récentes apparaîtront ici une fois que vous en aurez visité une.",
        issue: "Vos éléments de travail récents apparaîtront ici une fois que vous en aurez visité un.",
        default: "Vous n’avez pas encore d’éléments récents.",
      },
      filters: {
        all: "Tous",
        projects: "Projets",
        pages: "Pages",
        issues: "Éléments de travail",
      },
    },
    new_at_plane: {
      title: "Nouveau sur Plane",
    },
    quick_tutorial: {
      title: "Tutoriel rapide",
    },
    widget: {
      reordered_successfully: "Widget réorganisé avec succès.",
      reordering_failed: "Une erreur s’est produite lors de la réorganisation du widget.",
    },
    manage_widgets: "Gérer les widgets",
    title: "Accueil",
    star_us_on_github: "Donnez-nous une étoile sur GitHub",
  },
  link: {
    modal: {
      url: {
        text: "URL",
        required: "L’URL n’est pas valide",
        placeholder: "Tapez ou collez une URL",
      },
      title: {
        text: "Titre d’affichage",
        placeholder: "Comment ce lien sera présenté",
      },
    },
  },
  common: {
    all: "Tout",
    no_items_in_this_group: "Aucun élément dans ce groupe",
    drop_here_to_move: "Déposer ici pour déplacer",
    states: "États",
    state: "État",
    state_groups: "Groupes d’états",
    state_group: "Groupe d’état",
    priorities: "Priorités",
    priority: "Priorité",
    team_project: "Projet d’équipe",
    project: "Projet",
    cycle: "Cycle",
    cycles: "Cycles",
    module: "Module",
    modules: "Modules",
    labels: "Étiquettes",
    label: "Étiquette",
    assignees: "Acteurs",
    assignee: "Acteur",
    created_by: "Créé par",
    none: "Aucun",
    link: "Lien",
    estimates: "Estimations",
    estimate: "Estimation",
    created_at: "Créé le",
    completed_at: "Terminé le",
    layout: "Disposition",
    filters: "Filtres",
    display: "Affichage",
    load_more: "Charger plus",
    activity: "Activité",
    analytics: "Analyses",
    dates: "Dates",
    success: "Succès !",
    something_went_wrong: "Quelque chose s’est mal passé",
    error: {
      label: "Erreur !",
      message: "Une erreur s’est produite. Veuillez réessayer.",
    },
    group_by: "Grouper par",
    epic: "Epic",
    epics: "Epics",
    work_item: "Élément de travail",
    work_items: "Éléments de travail",
    sub_work_item: "Sous-élément de travail",
    add: "Ajouter",
    warning: "Avertissement",
    updating: "Mise à jour",
    adding: "Ajout",
    update: "Mettre à jour",
    creating: "Création",
    create: "Créer",
    cancel: "Annuler",
    description: "Description",
    title: "Titre",
    attachment: "Pièce jointe",
    general: "Général",
    features: "Fonctionnalités",
    automation: "Automatisation",
    project_name: "Nom du projet",
    project_id: "ID du projet",
    project_timezone: "Fuseau horaire du projet",
    created_on: "Créé le",
    update_project: "Mettre à jour le projet",
    identifier_already_exists: "L’identifiant existe déjà",
    add_more: "Ajouter plus",
    defaults: "Par défaut",
    add_label: "Ajouter une étiquette",
    customize_time_range: "Personnaliser la plage de temps",
    loading: "Chargement",
    attachments: "Pièces jointes",
    property: "Propriété",
    properties: "Propriétés",
    parent: "Parent",
    page: "Pâge",
    remove: "Supprimer",
    archiving: "Archivage",
    archive: "Archiver",
    access: {
      public: "Public",
      private: "Privé",
    },
    done: "Terminé",
    sub_work_items: "Sous-éléments de travail",
    comment: "Commentaire",
    workspace_level: "Niveau espace de travail",
    order_by: {
      label: "Trier par",
      manual: "Manuel",
      last_created: "Dernier créé",
      last_updated: "Dernière mise à jour",
      start_date: "Date de début",
      due_date: "Date d’échéance",
      asc: "Croissant",
      desc: "Décroissant",
      updated_on: "Mis à jour le",
    },
    sort: {
      asc: "Croissant",
      desc: "Décroissant",
      created_on: "Créé le",
      updated_on: "Mis à jour le",
    },
    comments: "Commentaires",
    updates: "Mises à jour",
    clear_all: "Tout effacer",
    copied: "Copié !",
    link_copied: "Lien copié !",
    link_copied_to_clipboard: "Lien copié dans le presse-papiers",
    copied_to_clipboard: "Lien de l’élément de travail copié dans le presse-papiers",
    is_copied_to_clipboard: "L’élément de travail est copié dans le presse-papiers",
    no_links_added_yet: "Aucun lien ajouté pour l’instant",
    add_link: "Ajouter un lien",
    links: "Liens",
    go_to_workspace: "Aller à l’espace de travail",
    progress: "Progression",
    optional: "Optionnel",
    join: "Rejoindre",
    go_back: "Retour",
    continue: "Continuer",
    resend: "Renvoyer",
    relations: "Relations",
    errors: {
      default: {
        title: "Erreur !",
        message: "Quelque chose s’est mal passé. Veuillez réessayer.",
      },
      required: "Ce champ est obligatoire",
      entity_required: "{entity} est requis",
      restricted_entity: "{entity} est restreint",
    },
    update_link: "Mettre à jour le lien",
    attach: "Joindre",
    create_new: "Créer nouveau",
    add_existing: "Ajouter existant",
    type_or_paste_a_url: "Tapez ou collez une URL",
    url_is_invalid: "L’URL n’est pas valide",
    display_title: "Titre d’affichage",
    link_title_placeholder: "Comment ce lien sera présenté",
    url: "URL",
    side_peek: "Aperçu latéral",
    modal: "Modal",
    full_screen: "Plein écran",
    close_peek_view: "Fermer l’aperçu",
    toggle_peek_view_layout: "Basculer la disposition de l’aperçu",
    options: "Options",
    duration: "Durée",
    today: "Aujourd’hui",
    week: "Semaine",
    month: "Mois",
    quarter: "Trimestre",
    press_for_commands: "Appuyez sur '/' pour les commandes",
    click_to_add_description: "Cliquez pour ajouter une description",
    search: {
      label: "Rechercher",
      placeholder: "Tapez pour rechercher",
      no_matches_found: "Aucune correspondance trouvée",
      no_matching_results: "Aucun résultat correspondant",
    },
    actions: {
      edit: "Modifier",
      make_a_copy: "Faire une copie",
      open_in_new_tab: "Ouvrir dans un nouvel onglet",
      copy_link: "Copier le lien",
      archive: "Archiver",
      delete: "Supprimer",
      remove_relation: "Supprimer la relation",
      subscribe: "S’abonner",
      unsubscribe: "Se désabonner",
      clear_sorting: "Effacer le tri",
      show_weekends: "Afficher les week-ends",
      enable: "Activer",
      disable: "Désactiver",
      copy_markdown: "Copier le markdown",
      restore: "Restaurer",
    },
    name: "Nom",
    discard: "Abandonner",
    confirm: "Confirmer",
    confirming: "Confirmation",
    read_the_docs: "Lire la documentation",
    default: "Par défaut",
    active: "Actif",
    enabled: "Activé",
    disabled: "Désactivé",
    mandate: "Mandat",
    mandatory: "Obligatoire",
    yes: "Oui",
    no: "Non",
    please_wait: "Veuillez patienter",
    enabling: "Activation",
    disabling: "Désactivation",
    beta: "Bêta",
    or: "ou",
    next: "Suivant",
    back: "Retour",
    cancelling: "Annulation",
    configuring: "Configuration",
    clear: "Effacer",
    import: "Importer",
    connect: "Connecter",
    authorizing: "Autorisation",
    processing: "Traitement",
    no_data_available: "Aucune donnée disponible",
    from: "de {name}",
    authenticated: "Authentifié",
    select: "Sélectionner",
    upgrade: "Mettre à niveau",
    add_seats: "Ajouter des sièges",
    projects: "Projets",
    workspace: "Espace de travail",
    workspaces: "Espaces de travail",
    team: "Équipe",
    teams: "Équipes",
    entity: "Entité",
    entities: "Entités",
    task: "Tâche",
    tasks: "Tâches",
    section: "Section",
    sections: "Sections",
    edit: "Modifier",
    connecting: "Connexion",
    connected: "Connecté",
    disconnect: "Déconnecter",
    disconnecting: "Déconnexion",
    installing: "Installation",
    install: "Installer",
    reset: "Réinitialiser",
    live: "En direct",
    change_history: "Historique des modifications",
    coming_soon: "À venir",
    member: "Membre",
    members: "Membres",
    you: "Vous",
    upgrade_cta: {
      higher_subscription: "Passer à un abonnement plus élevé",
      talk_to_sales: "Contacter le service commercial",
    },
    category: "Catégorie",
    categories: "Catégories",
    saving: "Enregistrement",
    save_changes: "Enregistrer les modifications",
    delete: "Supprimer",
    deleting: "Suppression",
    pending: "En attente",
    invite: "Inviter",
    view: "Afficher",
    deactivated_user: "Utilisateur désactivé",
    apply: "Appliquer",
    applying: "Application",
    users: "Utilisateurs",
    admins: "Administrateurs",
    guests: "Invités",
    on_track: "Sur la bonne voie",
    off_track: "Hors de la bonne voie",
    at_risk: "À risque",
    timeline: "Chronologie",
    completion: "Achèvement",
    upcoming: "À venir",
    completed: "Terminé",
    in_progress: "En cours",
    planned: "Planifié",
    paused: "En pause",
    no_of: "Nº de {entity}",
    resolved: "Résolu",
    cancelled: "Annulé",
    customer_requests: "Demandes clients",
    duplicate: "Dupliquer",
    overview: "Aperçu",
    worklogs: "Journaux de travail",
  },
  chart: {
    x_axis: "Axe X",
    y_axis: "Axe Y",
    metric: "Métrique",
  },
  form: {
    title: {
      required: "Le titre est requis",
      max_length: "Le titre doit contenir moins de {length} caractères",
    },
  },
  entity: {
    grouping_title: "Regroupement {entity}",
    priority: "Priorité {entity}",
    all: "Tous les {entity}",
    drop_here_to_move: "Déposez ici pour déplacer le {entity}",
    delete: {
      label: "Supprimer {entity}",
      success: "{entity} supprimé avec succès",
      failed: "Échec de la suppression de {entity}",
    },
    update: {
      failed: "Échec de la mise à jour de {entity}",
      success: "{entity} mis à jour avec succès",
    },
    link_copied_to_clipboard: "Lien {entity} copié dans le presse-papiers",
    fetch: {
      failed: "Erreur lors de la récupération de {entity}",
    },
    add: {
      success: "{entity} ajouté avec succès",
      failed: "Erreur lors de l’ajout de {entity}",
    },
    remove: {
      success: "{entity} supprimé avec succès",
      failed: "Erreur lors de la suppression de {entity}",
    },
  },
  epic: {
    all: "Tous les Epics",
    label: "{count, plural, one {Epic} other {Epics}}",
    new: "Nouvel Epic",
    adding: "Ajout d’un epic",
    create: {
      success: "Epic créé avec succès",
    },
    add: {
      press_enter: "Appuyez sur 'Entrée' pour ajouter un autre epic",
      label: "Ajouter un Epic",
    },
    title: {
      label: "Titre de l’Epic",
      required: "Le titre de l’Epic est requis.",
    },
  },
  issue: {
    label: "{count, plural, one {Élément de travail} other {Éléments de travail}}",
    all: "Tous les éléments de travail",
    edit: "Modifier l’élément de travail",
    title: {
      label: "Titre de l’élément de travail",
      required: "Le titre de l’élément de travail est requis.",
    },
    add: {
      press_enter: "Appuyez sur 'Entrée' pour ajouter un autre élément de travail",
      label: "Ajouter un élément de travail",
      cycle: {
        failed: "L’élément de travail n’a pas pu être ajouté au cycle. Veuillez réessayer.",
        success:
          "{count, plural, one {Élément de travail} other {Éléments de travail}} ajouté(s) au cycle avec succès.",
        loading: "Ajout de {count, plural, one {l’élément de travail} other {éléments de travail}} au cycle",
      },
      assignee: "Ajouter des assignés",
      start_date: "Ajouter une date de début",
      due_date: "Ajouter une date d’échéance",
      parent: "Ajouter un élément de travail parent",
      sub_issue: "Ajouter un sous-élément de travail",
      relation: "Ajouter une relation",
      link: "Ajouter un lien",
      existing: "Ajouter un élément de travail existant",
    },
    remove: {
      label: "Supprimer l’élément de travail",
      cycle: {
        loading: "Suppression de l’élément de travail du cycle",
        success: "Élément de travail supprimé du cycle avec succès.",
        failed: "L’élément de travail n’a pas pu être supprimé du cycle. Veuillez réessayer.",
      },
      module: {
        loading: "Suppression de l’élément de travail du module",
        success: "Élément de travail supprimé du module avec succès.",
        failed: "L’élément de travail n’a pas pu être supprimé du module. Veuillez réessayer.",
      },
      parent: {
        label: "Supprimer l’élément de travail parent",
      },
    },
    new: "Nouvel élément de travail",
    adding: "Ajout d’un élément de travail",
    create: {
      success: "Élément de travail créé avec succès",
    },
    priority: {
      urgent: "Urgent",
      high: "Haute",
      medium: "Moyenne",
      low: "Basse",
    },
    display: {
      properties: {
        label: "Propriétés d’affichage",
        id: "ID",
        issue_type: "Type d’élément de travail",
        sub_issue_count: "Nombre de sous-éléments",
        attachment_count: "Nombre de pièces jointes",
        created_on: "Créé le",
        sub_issue: "Sous-élément de travail",
        work_item_count: "Nombre d’éléments de travail",
      },
      extra: {
        show_sub_issues: "Afficher les sous-éléments",
        show_empty_groups: "Afficher les groupes vides",
      },
    },
    layouts: {
      ordered_by_label: "Cette disposition est triée par",
      list: "Liste",
      kanban: "Tableau",
      calendar: "Calendrier",
      spreadsheet: "Tableau",
      gantt: "Chronologie",
      title: {
        list: "Disposition en liste",
        kanban: "Disposition en tableau",
        calendar: "Disposition en calendrier",
        spreadsheet: "Disposition en tableau",
        gantt: "Disposition en chronologie",
      },
    },
    states: {
      active: "Actif",
      backlog: "Backlog",
    },
    comments: {
      placeholder: "Ajouter un commentaire",
      switch: {
        private: "Passer en commentaire privé",
        public: "Passer en commentaire public",
      },
      create: {
        success: "Commentaire créé avec succès",
        error: "Échec de la création du commentaire. Veuillez réessayer plus tard.",
      },
      update: {
        success: "Commentaire mis à jour avec succès",
        error: "Échec de la mise à jour du commentaire. Veuillez réessayer plus tard.",
      },
      remove: {
        success: "Commentaire supprimé avec succès",
        error: "Échec de la suppression du commentaire. Veuillez réessayer plus tard.",
      },
      upload: {
        error: "Échec du téléchargement du fichier. Veuillez réessayer plus tard.",
      },
      copy_link: {
        success: "Lien du commentaire copié dans le presse-papiers",
        error: "Erreur lors de la copie du lien du commentaire. Veuillez réessayer plus tard.",
      },
    },
    empty_state: {
      issue_detail: {
        title: "L’élément de travail n’existe pas",
        description: "L’élément de travail que vous recherchez n’existe pas, a été archivé ou a été supprimé.",
        primary_button: {
          text: "Voir les autres éléments de travail",
        },
      },
    },
    sibling: {
      label: "Éléments de travail frères",
    },
    archive: {
      description: "Seuls les éléments de travail\nterminés ou annulés peuvent être archivés",
      label: "Archiver l’élément de travail",
      confirm_message:
        "Êtes-vous sûr de vouloir archiver l’élément de travail ? Tous vos éléments archivés peuvent être restaurés ultérieurement.",
      success: {
        label: "Archivage réussi",
        message: "Vos archives se trouvent dans les archives du projet.",
      },
      failed: {
        message: "L’élément de travail n’a pas pu être archivé. Veuillez réessayer.",
      },
    },
    restore: {
      success: {
        title: "Restauration réussie",
        message: "Votre élément de travail se trouve dans les éléments de travail du projet.",
      },
      failed: {
        message: "L’élément de travail n’a pas pu être restauré. Veuillez réessayer.",
      },
    },
    relation: {
      relates_to: "En relation avec",
      duplicate: "Doublon de",
      blocked_by: "Bloqué par",
      blocking: "Bloque",
    },
    copy_link: "Copier le lien de l’élément de travail",
    delete: {
      label: "Supprimer l’élément de travail",
      error: "Erreur lors de la suppression de l’élément de travail",
    },
    subscription: {
      actions: {
        subscribed: "Abonnement à l’élément de travail réussi",
        unsubscribed: "Désabonnement de l’élément de travail réussi",
      },
    },
    select: {
      error: "Veuillez sélectionner au moins un élément de travail",
      empty: "Aucun élément de travail sélectionné",
      add_selected: "Ajouter les éléments de travail sélectionnés",
      select_all: "Sélectionner tout",
      deselect_all: "Tout désélectionner",
    },
    open_in_full_screen: "Ouvrir l’élément de travail en plein écran",
    columns: {
      cycle: {
        placeholder: "Sélectionner un cycle",
      },
      module: {
        placeholder: "Sélectionner des modules",
      },
    },
    bulk_operations: {
      action_bar: {
        delete_modal: {
          title: "Supprimer les éléments de travail",
          content:
            "Êtes-vous sûr de vouloir supprimer les {count} élément(s) de travail sélectionné(s) ? Cette action est irréversible.",
        },
        clear_selection: "Effacer la sélection",
        selected_count: "{count} sélectionné(s)",
      },
    },
    labels: {
      create: {
        new_label_toggle: "Nouveau",
        name_required: "Ce champ est requis",
      },
    },
    sidebar: {
      recurring: {
        label: "Récurrent",
        generated_from: "Généré depuis : {name}",
        generated_from_deleted: "Généré depuis : {name} (modèle supprimé)",
        template_deleted_suffix: "(modèle supprimé)",
      },
    },
  },
  attachment: {
    error: "Le fichier n’a pas pu être joint. Essayez de le télécharger à nouveau.",
    only_one_file_allowed: "Un seul fichier peut être téléchargé à la fois.",
    file_size_limit: "Le fichier doit faire {size}MB ou moins.",
    drag_and_drop: "Glissez-déposez n’importe où pour uploader",
    delete: "Supprimer la pièce jointe",
  },
  label: {
    select: "Sélectionner une étiquette",
    create: {
      success: "Étiquette créée avec succès",
      failed: "Échec de la création de l’étiquette",
      already_exists: "L’étiquette existe déjà",
      type: "Tapez pour ajouter une nouvelle étiquette",
    },
    delete_modal: {
      title: "Supprimer le libellé",
      content_prefix: "Êtes-vous sûr de vouloir supprimer",
      content_suffix:
        " ? Cela supprimera le libellé de tous les éléments de travail et de toutes les vues où ce libellé est utilisé comme filtre.",
      error: "Le libellé n’a pas pu être supprimé. Veuillez réessayer.",
    },
  },
  sub_work_item: {
    update: {
      success: "Sous-élément de travail mis à jour avec succès",
      error: "Erreur lors de la mise à jour du sous-élément de travail",
    },
    remove: {
      success: "Sous-élément de travail supprimé avec succès",
      error: "Erreur lors de la suppression du sous-élément de travail",
    },
    empty_state: {
      sub_list_filters: {
        title: "Vous n’avez pas de sous-éléments de travail qui correspondent aux filtres que vous avez appliqués.",
        description: "Pour voir tous les sous-éléments de travail, effacer tous les filtres appliqués.",
        action: "Effacer les filtres",
      },
      list_filters: {
        title: "Vous n’avez pas d’éléments de travail qui correspondent aux filtres que vous avez appliqués.",
        description: "Pour voir tous les éléments de travail, effacer tous les filtres appliqués.",
        action: "Effacer les filtres",
      },
    },
  },
  view: {
    label: "{count, plural, one {Vue} other {Vues}}",
    create: {
      label: "Créer une vue",
    },
    update: {
      label: "Mettre à jour la vue",
    },
    subscription: {
      also_send_by_email_description:
        "Les notifications dans l'application sont toujours activées pendant l'abonnement.",
      also_send_by_email_title: "Envoyer aussi par e-mail",
      item_added_description: "Un élément de travail commence à correspondre aux filtres de cette vue.",
      item_added_title: "Élément ajouté",
      item_cancelled_description: "L'état d'un élément de travail correspondant passe à un état annulé.",
      item_cancelled_title: "Élément annulé",
      item_completed_description: "L'état d'un élément de travail correspondant passe à un état terminé.",
      item_completed_title: "Élément terminé",
      notify_me_description:
        "Recevez une notification dans l'application lorsqu'un élément de travail commence à correspondre à cette vue.",
      notify_me_title: "Me notifier à propos de cette vue",
      subscribe_tooltip: "S'abonner à cette vue",
      subscribed_tooltip: "Abonné à cette vue",
    },
  },
  inbox_issue: {
    status: {
      pending: {
        title: "En attente",
        description: "En attente",
      },
      declined: {
        title: "Refusé",
        description: "Refusé",
      },
      snoozed: {
        title: "Reporté",
        description: "{days, plural, one{# jour} other{# jours}} restant(s)",
      },
      accepted: {
        title: "Accepté",
        description: "Accepté",
      },
      duplicate: {
        title: "Doublon",
        description: "Doublon",
      },
    },
    modals: {
      decline: {
        title: "Refuser l’élément de travail",
        content: "Êtes-vous sûr de vouloir refuser l’élément de travail {value} ?",
      },
      delete: {
        title: "Supprimer l’élément de travail",
        content: "Êtes-vous sûr de vouloir supprimer l’élément de travail {value} ?",
        success: "Élément de travail supprimé avec succès",
      },
    },
    errors: {
      snooze_permission:
        "Seuls les administrateurs du projet peuvent reporter/annuler le report des éléments de travail",
      accept_permission: "Seuls les administrateurs du projet peuvent accepter les éléments de travail",
      decline_permission: "Seuls les administrateurs du projet peuvent refuser les éléments de travail",
      permission_denied: "Permission refusée",
      duplicate_permission: "Seuls les administrateurs du projet peuvent marquer un élément de travail comme doublon",
    },
    actions: {
      accept: "Accepter",
      decline: "Refuser",
      snooze: "Reporter",
      unsnooze: "Annuler le report",
      copy: "Copier le lien de l’élément de travail",
      delete: "Supprimer",
      open: "Ouvrir l’élément de travail",
      mark_as_duplicate: "Marquer comme doublon",
      move: "Déplacer {value} vers les éléments de travail du projet",
    },
    source: {
      "in-app": "in-app",
    },
    order_by: {
      created_at: "Créé le",
      updated_at: "Mis à jour le",
      id: "ID",
    },
    label: "Intake",
    page_label: "{workspace} - Intake",
    modal: {
      title: "Créer un élément de travail Intake",
    },
    tabs: {
      open: "Ouvert",
      closed: "Fermé",
    },
    empty_state: {
      sidebar_open_tab: {
        title: "Aucun élément de travail ouvert",
        description: "Trouvez les éléments de travail ouverts ici. Créez un nouvel élément de travail.",
      },
      sidebar_closed_tab: {
        title: "Aucun élément de travail fermé",
        description: "Tous les éléments de travail, qu’ils soient acceptés ou refusés, peuvent être trouvés ici.",
      },
      sidebar_filter: {
        title: "Aucun élément de travail correspondant",
        description:
          "Aucun élément de travail ne correspond au filtre appliqué dans Intake. Créez un nouvel élément de travail.",
      },
      detail: {
        title: "Sélectionnez un élément de travail pour voir ses détails.",
      },
    },
    navigation: {
      previous: "Élément de travail précédent",
      next: "Élément de travail suivant",
    },
    filters: {
      created_by: "Créé par",
      created_date: "Date de création",
      updated_date: "Date de mise à jour",
      last_updated_date: "Date de dernière mise à jour",
      custom: "Personnalisé",
    },
    select_duplicate: {
      select_work_item: "Sélectionner un élément de travail",
      search_placeholder: "Rechercher...",
    },
  },
  workspace_creation: {
    heading: "Créez votre espace de travail",
    subheading: "Pour commencer à utiliser Plane, vous devez créer ou rejoindre un espace de travail.",
    form: {
      name: {
        label: "Nommez votre espace de travail",
        placeholder: "Quelque chose de familier et reconnaissable est toujours préférable.",
        onboarding_placeholder: "Entrez le nom de l'espace de travail",
      },
      url: {
        label: "Définissez l’URL de votre espace de travail",
        placeholder: "Tapez ou collez une URL",
        edit_slug: "Vous ne pouvez modifier que le slug de l’URL",
      },
      organization_size: {
        label: "Combien de personnes utiliseront cet espace de travail ?",
        placeholder: "Sélectionnez une plage",
        options: {
          just_myself: "Juste moi",
        },
      },
    },
    errors: {
      creation_disabled: {
        title: "Seul l’administrateur de votre instance peut créer des espaces de travail",
        description:
          "Si vous connaissez l’adresse e-mail de votre administrateur d’instance, cliquez sur le bouton ci-dessous pour le contacter.",
        request_button: "Contacter l’administrateur d’instance",
      },
      validation: {
        name_alphanumeric:
          "Les noms d’espaces de travail ne peuvent contenir que (' '), ('-'), ('_') et des caractères alphanumériques.",
        name_length: "Limitez votre nom à 80 caractères.",
        url_alphanumeric: "Les URL ne peuvent contenir que ('-') et des caractères alphanumériques.",
        url_length: "Limitez votre URL à 48 caractères.",
        url_already_taken: "L’URL de l’espace de travail est déjà prise !",
      },
      creation_disabled_no_invites:
        "Vous ne semblez avoir aucune invitation à un espace de travail et votre administrateur d'instance a restreint la création de nouveaux espaces de travail. Demandez à un propriétaire ou administrateur d'espace de travail de vous inviter d'abord, puis revenez sur cet écran pour le rejoindre.",
    },
    request_email: {
      subject: "Demande d’un nouvel espace de travail",
      body: "Bonjour administrateur(s) d’instance,\n\nVeuillez créer un nouvel espace de travail avec l’URL [/workspace-name] pour [objectif de création de l'espace de travail].\n\nMerci,\n{firstName} {lastName}\n{email}",
    },
    button: {
      default: "Créer l’espace de travail",
      loading: "Création de l’espace de travail",
    },
    toast: {
      success: {
        title: "Succès",
        message: "Espace de travail créé avec succès",
      },
      error: {
        title: "Erreur",
        message: "L’espace de travail n’a pas pu être créé. Veuillez réessayer.",
      },
    },
    join_existing_workspace: "Rejoindre un espace de travail existant",
  },
  workspace_dashboard: {
    empty_state: {
      general: {
        title: "Aperçu de vos projets, activités et métriques",
        description:
          "Bienvenue sur Plane, nous sommes ravis de vous avoir parmi nous. Créez votre premier projet et suivez vos éléments de travail, et cette page se transformera en un espace qui vous aide à progresser. Les administrateurs verront également les éléments qui aident leur équipe à progresser.",
        primary_button: {
          text: "Construisez votre premier projet",
          comic: {
            title: "Tout commence par un projet dans Plane",
            description:
              "Un projet peut être la feuille de route d’un produit, une campagne marketing ou le lancement d’une nouvelle voiture.",
          },
        },
      },
    },
  },
  workspace_analytics: {
    label: "Analytique",
    page_label: "{workspace} - Analytique",
    open_tasks: "Total des tâches ouvertes",
    error: "Une erreur s’est produite lors de la récupération des données.",
    work_items_closed_in: "Éléments de travail fermés dans",
    selected_projects: "Projets sélectionnés",
    total_members: "Total des membres",
    total_cycles: "Total des Cycles",
    total_modules: "Total des Modules",
    pending_work_items: {
      title: "Éléments de travail en attente",
      empty_state: "L’analyse des éléments de travail en attente par acteur apparaît ici.",
    },
    work_items_closed_in_a_year: {
      title: "Éléments de travail fermés dans l’année",
      empty_state: "Fermez des éléments de travail pour voir leur analyse sous forme de graphique.",
    },
    most_work_items_created: {
      title: "Plus d’éléments de travail créés",
      empty_state: "Les acteurs et le nombre d’éléments de travail créés par eux apparaissent ici.",
    },
    most_work_items_closed: {
      title: "Plus d’éléments de travail fermés",
      empty_state: "Les acteurs et le nombre d’éléments de travail fermés par eux apparaissent ici.",
    },
    tabs: {
      scope_and_demand: "Scope et Demande",
      custom: "Analytique Personnalisée",
    },
    empty_state: {
      customized_insights: {
        description: "Les éléments de travail qui vous sont assignés, répartis par état, s’afficheront ici.",
        title: "Pas encore de données",
      },
      created_vs_resolved: {
        description: "Les éléments de travail créés et résolus au fil du temps s’afficheront ici.",
        title: "Pas encore de données",
      },
      project_insights: {
        title: "Pas encore de données",
        description: "Les éléments de travail qui vous sont assignés, répartis par état, s’afficheront ici.",
      },
      general: {
        title:
          "Suivez les progrès, les charges de travail et les affectations. Identifiez les tendances, levez les blocages et travaillez plus rapidement",
        description:
          "Surveillez le scope par rapport à la demande, suivez les estimations et les éventuels glissements de périmètre. Assurez-vous que les membres de votre équipe et vos équipes sont performants, et veillez à ce que votre projet avance dans les délais impartis.",
        primary_button: {
          text: "Commencez votre premier projet",
          comic: {
            title: "L’analytics fonctionne mieux avec les Cycles + Modules",
            description:
              "D’abord, encadrez vos éléments de travail dans des Cycles et, si possible, regroupez les éléments qui s’étendent sur plus d’un cycle dans des Modules. Consultez les deux dans la navigation de gauche.",
          },
        },
      },
    },
    created_vs_resolved: "Créé vs Résolu",
    customized_insights: "Informations personnalisées",
    backlog_work_items: "{entity} en backlog",
    active_projects: "Projets actifs",
    trend_on_charts: "Tendance sur les graphiques",
    all_projects: "Tous les projets",
    summary_of_projects: "Résumé des projets",
    project_insights: "Aperçus du projet",
    started_work_items: "{entity} commencés",
    total_work_items: "Total des {entity}",
    total_projects: "Total des projets",
    total_admins: "Total des administrateurs",
    total_users: "Nombre total d’utilisateurs",
    total_intake: "Revenu total",
    un_started_work_items: "{entity} non commencés",
    total_guests: "Nombre total d’invités",
    completed_work_items: "{entity} terminés",
    total: "Total des {entity}",
    duration_percentiles: {
      cycle_time: "Temps de cycle",
      cycle_time_description: "Temps entre le démarrage et la finalisation, en jours",
      lead_time: "Délai de réalisation",
      lead_time_description: "Temps entre la création et la finalisation, en jours",
      no_data: "Pas encore assez de données",
      p50: "P50",
      p75: "P75",
      p90: "P90",
      sample_size: "Taille de l’échantillon",
      title: "Percentiles de durée",
      triage_time: "Temps de tri",
      triage_time_description: "Temps entre la réception et la décision de tri, en jours",
    },
    durations: "Durées",
    velocity: "Vélocité",
    velocity_rollup: {
      columns: {
        completed_estimate_points: "Points terminés",
        completed_work_items: "Éléments de travail terminés",
        cycle: "Cycle",
        end_date: "Terminé le",
        project: "Projet",
      },
      title: "Vélocité des cycles",
    },
    select_params: {
      add_property: "Ajouter une propriété",
    },
  },
  workspace_projects: {
    label: "{count, plural, one {Projet} other {Projets}}",
    create: {
      label: "Ajouter un Projet",
    },
    network: {
      private: {
        title: "Privé",
        description: "Accessible uniquement sur invitation",
      },
      public: {
        title: "Public",
        description: "Accessible à tous dans l’espace de travail, sauf les invités",
      },
      label: "Réseau",
    },
    error: {
      permission: "Vous n’avez pas la permission d’effectuer cette action.",
      cycle_delete: "Échec de la suppression du cycle",
      module_delete: "Échec de la suppression du module",
      issue_delete: "Échec de la suppression de l’élément de travail",
    },
    state: {
      backlog: "Backlog",
      unstarted: "Non commencé",
      started: "Commencé",
      completed: "Terminé",
      cancelled: "Annulé",
    },
    sort: {
      manual: "Manuel",
      name: "Nom",
      created_at: "Date de création",
      members_length: "Nombre de membres",
    },
    scope: {
      my_projects: "Mes projets",
      archived_projects: "Archivés",
    },
    common: {
      months_count: "{months, plural, one{# mois} other{# mois}}",
    },
    empty_state: {
      general: {
        title: "Aucun projet actif",
        description:
          "Considérez chaque projet comme le parent d’activités axées sur les objectifs. Les projets regroupent les tâches, les cycles et les modules et, avec l'aide de vos collègues, vous aident à atteindre ces objectifs. Créez un nouveau projet ou filtrez les projets archivés.",
        primary_button: {
          text: "Commencez votre premier projet",
          comic: {
            title: "Tout commence par un projet dans Plane",
            description:
              "Un projet peut être la feuille de route d’un produit, une campagne marketing ou le lancement d’une nouvelle voiture.",
          },
        },
      },
      no_projects: {
        title: "Aucun projet",
        description:
          "Pour créer des éléments de travail ou gérer votre travail, vous devez créer un projet ou faire partie d’un projet.",
        primary_button: {
          text: "Commencez votre premier projet",
          comic: {
            title: "Tout commence par un projet dans Plane",
            description:
              "Un projet peut être la feuille de route d’un produit, une campagne marketing ou le lancement d’une nouvelle voiture.",
          },
        },
      },
      filter: {
        title: "Aucun projet correspondant",
        description: "Aucun projet détecté avec les critères correspondants. \n Créez plutôt un nouveau projet.",
      },
      search: {
        description: "Aucun projet détecté avec les critères correspondants.\nCréez plutôt un nouveau projet",
      },
    },
  },
  workspace_views: {
    add_view: "Ajouter une vue",
    empty_state: {
      "all-issues": {
        title: "Aucun élément de travail dans le projet",
        description:
          "Premier projet terminé ! Maintenant, découpez votre travail en tâches gérables à l’aide d’éléments de travail. C’est parti !",
        primary_button: {
          text: "Créer un nouvel élément de travail",
        },
      },
      assigned: {
        title: "Aucun élément de travail pour le moment",
        description: "Les éléments de travail qui vous sont assignés peuvent être suivis ici.",
        primary_button: {
          text: "Créer un nouvel élément de travail",
        },
      },
      created: {
        title: "Aucun élément de travail pour le moment",
        description: "Tous les éléments de travail que vous créez arrivent ici, suivez-les directement ici.",
        primary_button: {
          text: "Créer un nouvel élément de travail",
        },
      },
      subscribed: {
        title: "Aucun élément de travail pour le moment",
        description: "Abonnez-vous aux éléments de travail qui vous intéressent, suivez-les tous ici.",
      },
      "custom-view": {
        title: "Aucun élément de travail pour le moment",
        description: "Les éléments de travail qui correspondent aux filtres, suivez-les tous ici.",
      },
    },
    delete_view: {
      title: "Êtes-vous sûr de vouloir supprimer cette vue ?",
      content:
        "Si vous confirmez, toutes les options de tri, de filtrage et d’affichage et la mise en page que vous avez choisie pour cette vue seront définitivement supprimées sans possibilité de les restaurer.",
    },
  },
  account_settings: {
    profile: {
      change_email_modal: {
        title: "Changer d’adresse e-mail",
        description: "Saisissez une nouvelle adresse e-mail pour recevoir un lien de vérification.",
        toasts: {
          success_title: "Succès !",
          success_message: "Adresse e-mail mise à jour. Veuillez vous reconnecter.",
        },
        form: {
          email: {
            label: "Nouvelle adresse e-mail",
            placeholder: "Saisissez votre e-mail",
            errors: {
              required: "L’e-mail est requis",
              invalid: "L’e-mail est invalide",
              exists: "Cette adresse e-mail existe déjà. Utilisez-en une autre.",
              validation_failed: "Échec de la validation de l’e-mail. Veuillez réessayer.",
            },
          },
          code: {
            label: "Code unique",
            placeholder: "123456",
            helper_text: "Code de vérification envoyé à votre nouvel e-mail.",
            errors: {
              required: "Le code unique est requis",
              invalid: "Code de vérification invalide. Veuillez réessayer.",
            },
          },
        },
        actions: {
          continue: "Continuer",
          confirm: "Confirmer",
          cancel: "Annuler",
        },
        states: {
          sending: "Envoi…",
        },
      },
      general_form: {
        toast: {
          success_title: "Succès !",
          error_title: "Erreur !",
          avatar_delete_success: "Photo de profil supprimée avec succès.",
          avatar_delete_error:
            "Une erreur s'est produite lors de la suppression de votre photo de profil. Veuillez réessayer.",
          cover_image_error: "Échec du traitement de l'image de couverture",
          updating: "Mise à jour en cours...",
          update_success: "Profil mis à jour avec succès.",
          update_error: "Une erreur s'est produite lors de la mise à jour de votre profil. Veuillez réessayer.",
        },
        errors: {
          first_name_required: "Veuillez saisir votre prénom",
          display_name_required: "Le nom d'affichage est requis.",
          email_required: "L'adresse e-mail est requise.",
        },
        placeholders: {
          first_name: "Entrez votre prénom",
          last_name: "Entrez votre nom de famille",
          display_name: "Entrez votre nom d'affichage",
        },
      },
    },
    activity: {
      description: "Suivez vos actions et modifications récentes sur l’ensemble de vos projets et éléments de travail.",
      heading: "Activité",
    },
    api_tokens: {
      description:
        "Générez des jetons API sécurisés pour intégrer vos données à des systèmes et applications externes.",
      heading: "Jetons d’accès personnels",
    },
    notifications: {
      description:
        "Restez informé des éléments de travail auxquels vous êtes abonné. Activez cette option pour être notifié.",
      heading: "Notifications par e-mail",
    },
    preferences: {
      description: "Personnalisez votre expérience de l’application selon votre façon de travailler",
      heading: "Préférences",
    },
    security: {
      heading: "Sécurité",
    },
    slack_account_link: {
      code_expires: "Ce code expire dans 15 minutes.",
      description:
        "Associez votre identité Slack personnelle afin que les éléments de travail et commentaires que vous créez depuis Slack vous soient attribués, plutôt qu’au bot Slack générique.",
      generate_code: "Obtenir un code de liaison",
      heading: "Compte Slack",
      instructions: "Dans Slack, envoyez cette commande à l’application Plane :",
      linked_as: "Associé en tant que {name}",
      no_workspace: "Vous devez être membre d’au moins un espace de travail pour associer un compte Slack.",
      not_linked: "Non associé",
      toast: {
        unlink_success: "Compte Slack dissocié.",
        verify_error: "Ce code est invalide ou a expiré.",
        verify_success: "Compte Slack associé avec succès.",
      },
      unlink: "Dissocier",
      verify_label: "Vous avez déjà un code provenant de Slack ?",
      verify_placeholder: "Saisissez le code à 6 chiffres",
      verify_submit: "Vérifier",
    },
    actions: {
      permissions: "Mes autorisations",
    },
    permissions_page: {
      category_views: "Vues",
      description:
        "Votre niveau de base au niveau du workspace pour les 5 domaines couverts par ce générateur (Éléments de travail, Cycles, Modules, Pages, Vues). Vos autorisations réelles peuvent être supérieures ou inférieures sur un projet spécifique si votre rôle y diffère de votre rôle de workspace - ce résumé ne reflète pas les surcharges par projet. Tout le reste (facturation, intégrations, exports...) suit toujours votre rôle de workspace classique.",
      empty_state: "Votre rôle n'accorde encore aucune des autorisations couvertes par ce générateur.",
      unknown_role: "Inconnu",
      your_role: "Votre rôle",
    },
  },
  workspace_settings: {
    label: "Paramètres de l’espace de travail",
    page_label: "{workspace} - Paramètres généraux",
    key_created: "Clé créée",
    copy_key:
      "Copiez et sauvegardez cette clé secrète dans Plane Pages. Vous ne pourrez plus voir cette clé après avoir cliqué sur Fermer. Un fichier CSV contenant la clé a été téléchargé.",
    token_copied: "Jeton copié dans le presse-papiers.",
    settings: {
      general: {
        title: "Général",
        upload_logo: "Télécharger le logo",
        edit_logo: "Modifier le logo",
        name: "Nom de l’espace de travail",
        company_size: "Taille de l’entreprise",
        url: "URL de l’espace de travail",
        workspace_timezone: "Fuseau horaire de l’espace de travail",
        update_workspace: "Mettre à jour l’espace de travail",
        delete_workspace: "Supprimer cet espace de travail",
        delete_workspace_description:
          "Lors de la suppression d’un espace de travail, toutes les données et ressources au sein de cet espace seront définitivement supprimées et ne pourront pas être récupérées.",
        delete_btn: "Supprimer cet espace de travail",
        delete_modal: {
          title: "Êtes-vous sûr de vouloir supprimer cet espace de travail ?",
          description:
            "Vous avez un essai actif sur l’un de nos forfaits payants. Veuillez d’abord l’annuler pour continuer.",
          dismiss: "Fermer",
          cancel: "Annuler l’essai",
          success_title: "Espace de travail supprimé.",
          success_message: "Vous serez bientôt redirigé vers votre page de profil.",
          error_title: "Cela n’a pas fonctionné.",
          error_message: "Veuillez réessayer.",
        },
        errors: {
          name: {
            required: "Le nom est requis",
            max_length: "Le nom de l’espace de travail ne doit pas dépasser 80 caractères",
          },
          company_size: {
            required: "La taille de l’entreprise est requise",
            select_a_range: "Sélectionner la taille de l’organisation",
          },
        },
      },
      members: {
        title: "Membres",
        add_member: "Ajouter un membre",
        pending_invites: "Invitations en attente",
        invitations_sent_successfully: "Invitations envoyées avec succès",
        leave_confirmation:
          "Êtes-vous sûr de vouloir quitter l’espace de travail ? Vous n’aurez plus accès à cet espace de travail. Cette action ne peut pas être annulée.",
        details: {
          full_name: "Nom complet",
          display_name: "Nom d’affichage",
          email_address: "Adresse e-mail",
          account_type: "Type de compte",
          authentication: "Authentification",
          joining_date: "Date d’adhésion",
        },
        modal: {
          title: "Inviter des personnes à collaborer",
          description: "Invitez des personnes à collaborer sur votre espace de travail.",
          button: "Envoyer les invitations",
          button_loading: "Envoi des invitations",
          placeholder: "nom@entreprise.com",
          errors: {
            required: "Nous avons besoin d’une adresse e-mail pour les inviter.",
            invalid: "L’e-mail est invalide",
          },
        },
        columns: {
          leave: "Quitter",
          remove: "Retirer",
          scim_confirm_content:
            "Le rôle de {name} est géré par votre fournisseur d'identité SCIM. Le modifier ici n'affecte que Plane - votre IdP n'a pas connaissance de ce changement et peut l'écraser lors de la prochaine synchronisation.",
          scim_confirm_default: "Modifier le rôle quand même",
          scim_confirm_loading: "Modification en cours",
          scim_confirm_title: "Modifier le rôle d'un membre géré par SCIM ?",
          suspended: "Suspendu",
          transfer_ownership: "Transférer la propriété",
          workspace_owner: "Propriétaire du workspace",
        },
      },
      billing_and_plans: {
        title: "Facturation & Plans",
        current_plan: "Plan actuel",
        free_plan: "Vous utilisez actuellement le plan gratuit",
        view_plans: "Voir les plans",
        description:
          "Choisissez votre forfait, gérez vos abonnements et effectuez facilement une mise à niveau selon vos besoins.",
        heading: "Facturation et forfaits",
      },
      exports: {
        title: "Exportations",
        exporting: "Exportation",
        previous_exports: "Exportations précédentes",
        export_separate_files: "Exporter les données dans des fichiers séparés",
        filters_info: "Appliquez des filtres pour exporter des éléments de travail spécifiques selon vos critères.",
        modal: {
          title: "Exporter vers",
          toasts: {
            success: {
              title: "Exportation réussie",
              message: "Vous pourrez télécharger les {entity} exportés depuis l’exportation précédente.",
            },
            error: {
              title: "Échec de l’exportation",
              message: "L’exportation a échoué. Veuillez réessayer.",
            },
          },
        },
        description:
          "Exportez les données de votre projet dans divers formats et accédez à votre historique d’exports avec des liens de téléchargement.",
        exporting_projects: "Export du projet en cours",
        format: "Format",
        heading: "Exports",
      },
      webhooks: {
        title: "Webhooks",
        add_webhook: "Ajouter un webhook",
        modal: {
          title: "Créer un webhook",
          details: "Détails du webhook",
          payload: "URL de la charge utile",
          question: "Quels événements souhaitez-vous déclencher avec ce webhook ?",
          error: "L’URL est requise",
        },
        secret_key: {
          title: "Clé secrète",
          message: "Générer un jeton pour signer la charge utile du webhook",
        },
        options: {
          all: "Envoyez-moi tout",
          individual: "Sélectionner des événements individuels",
        },
        toasts: {
          created: {
            title: "Webhook créé",
            message: "Le webhook a été créé avec succès",
          },
          not_created: {
            title: "Webhook non créé",
            message: "Le webhook n’a pas pu être créé",
          },
          updated: {
            title: "Webhook mis à jour",
            message: "Le webhook a été mis à jour avec succès",
          },
          not_updated: {
            title: "Webhook non mis à jour",
            message: "Le webhook n’a pas pu être mis à jour",
          },
          removed: {
            title: "Webhook supprimé",
            message: "Le webhook a été supprimé avec succès",
          },
          not_removed: {
            title: "Webhook non supprimé",
            message: "Le webhook n’a pas pu être supprimé",
          },
          secret_key_copied: {
            message: "Clé secrète copiée dans le presse-papiers.",
          },
          secret_key_not_copied: {
            message: "Une erreur s’est produite lors de la copie de la clé secrète.",
          },
        },
        description:
          "Automatisez les notifications vers des services externes lorsque des événements de projet se produisent.",
        heading: "Webhooks",
        delete_modal: {
          content:
            "Voulez-vous vraiment supprimer ce webhook ? Les événements futurs ne seront plus envoyés à ce webhook. Cette action est irréversible.",
          error_message: "Le webhook n'a pas pu être supprimé. Veuillez réessayer.",
          success_message: "Webhook supprimé avec succès.",
          title: "Supprimer le webhook",
        },
      },
      api_tokens: {
        title: "Jetons API",
        add_token: "Ajouter un jeton API",
        create_token: "Créer un jeton",
        never_expires: "N’expire jamais",
        generate_token: "Générer un jeton",
        generating: "Génération",
        delete: {
          title: "Supprimer le jeton API",
          description:
            "Toute application utilisant ce jeton n’aura plus accès aux données de Plane. Cette action ne peut pas être annulée.",
          success: {
            title: "Succès !",
            message: "Le jeton API a été supprimé avec succès",
          },
          error: {
            title: "Erreur !",
            message: "Le jeton API n’a pas pu être supprimé",
          },
        },
        errors: {
          expiration_date_required: "Veuillez sélectionner une date d'expiration.",
        },
        custom_date: "Date personnalisée",
        set_expiration_date: "Définir la date d'expiration",
        expiry_options: {
          custom: "Personnalisé",
          "1_week": "1 semaine",
          "1_month": "1 mois",
          "3_months": "3 mois",
          "1_year": "1 an",
        },
        set_date: "Définir la date",
        expires_at: "Expire le {date} à {time}",
      },
    },
    empty_state: {
      api_tokens: {
        title: "Aucun jeton API créé",
        description:
          "Les API Plane peuvent être utilisées pour intégrer vos données dans Plane avec n’importe quel système externe. Créez un jeton pour commencer.",
      },
      webhooks: {
        title: "Aucun webhook ajouté",
        description: "Créez des webhooks pour recevoir des mises à jour en temps réel et automatiser des actions.",
      },
      exports: {
        title: "Aucune exportation pour le moment",
        description: "Chaque fois que vous exportez, vous aurez également une copie ici pour référence.",
      },
      imports: {
        title: "Aucune importation pour le moment",
        description: "Trouvez toutes vos importations précédentes ici et téléchargez-les.",
      },
    },
  },
  profile: {
    label: "Profil",
    page_label: "Votre travail",
    work: "Travail",
    details: {
      joined_on: "Inscrit le",
      time_zone: "Fuseau horaire",
    },
    stats: {
      workload: "Charge de travail",
      overview: "Vue d’ensemble",
      created: "Éléments de travail créés",
      assigned: "Éléments de travail assignés",
      subscribed: "Éléments de travail suivis",
      state_distribution: {
        title: "Éléments de travail par état",
        empty:
          "Créez des éléments de travail pour les visualiser par état dans le graphique pour une meilleure analyse.",
      },
      priority_distribution: {
        title: "Éléments de travail par priorité",
        empty:
          "Créez des éléments de travail pour les visualiser par priorité dans le graphique pour une meilleure analyse.",
      },
      recent_activity: {
        title: "Activité récente",
        empty: "Nous n’avons pas trouvé de données. Veuillez consulter vos contributions",
        button: "Télécharger l'activité du jour",
        button_loading: "Téléchargement",
      },
    },
    actions: {
      profile: "Profil",
      security: "Sécurité",
      activity: "Activité",
      appearance: "Apparence",
      notifications: "Notifications",
      "api-tokens": "Jetons d’accès personnels",
      permissions: "Mes permissions",
      preferences: "Préférences",
    },
    tabs: {
      summary: "Résumé",
      assigned: "Assigné",
      created: "Créé",
      subscribed: "Suivi",
      activity: "Activité",
    },
    empty_state: {
      activity: {
        title: "Aucune activité pour le moment",
        description:
          "Commencez par créer un nouvel élément de travail ! Ajoutez-y des détails et des propriétés. Explorez davantage Plane pour voir votre activité.",
      },
      assigned: {
        title: "Aucun élément de travail ne vous est assigné",
        description: "Les éléments de travail qui vous sont assignés peuvent être suivis ici.",
      },
      created: {
        title: "Aucun élément de travail pour le moment",
        description: "Tous les éléments de travail que vous créez apparaissent ici, suivez-les directement ici.",
      },
      subscribed: {
        title: "Aucun élément de travail pour le moment",
        description: "Abonnez-vous aux éléments de travail qui vous intéressent, suivez-les tous ici.",
      },
    },
  },
  project_settings: {
    general: {
      enter_project_id: "Saisissez l’ID du projet",
      please_select_a_timezone: "Veuillez sélectionner un fuseau horaire",
      archive_project: {
        title: "Archiver le projet",
        description:
          "L'archivage d’un projet le retirera de votre navigation latérale, bien que vous pourrez toujours y accéder depuis votre page de projets. Vous pouvez restaurer le projet ou le supprimer quand vous le souhaitez.",
        button: "Archiver le projet",
      },
      delete_project: {
        title: "Supprimer le projet",
        description:
          "Lors de la suppression d’un projet, toutes les données et ressources de ce projet seront définitivement supprimées et ne pourront pas être récupérées.",
        button: "Supprimer mon projet",
      },
      toast: {
        success: "Projet mis à jour avec succès",
        error: "Le projet n’a pas pu être mis à jour. Veuillez réessayer.",
      },
    },
    members: {
      label: "Membres",
      project_lead: "Chef de projet",
      default_assignee: "Acteur par défaut",
      guest_super_permissions: {
        title: "Accorder l’accès en lecture à tous les éléments de travail pour les utilisateurs invités :",
        sub_heading: "Cela permettra aux invités d’avoir un accès en lecture à tous les éléments de travail du projet.",
      },
      invite_members: {
        title: "Inviter des membres",
        sub_heading: "Invitez des membres à travailler sur votre projet.",
        select_co_worker: "Sélectionner un acteur",
      },
    },
    states: {
      describe_this_state_for_your_members: "Décrivez cet état pour vos membres.",
      empty_state: {
        title: "Aucun état disponible pour le groupe {groupKey}",
        description: "Veuillez créer un nouvel état",
      },
      description:
        "Définissez et personnalisez les états du workflow pour suivre l’avancement de vos éléments de travail.",
      heading: "États",
    },
    labels: {
      label_title: "Titre de l’étiquette",
      label_title_is_required: "Le titre de l’étiquette est requis",
      label_max_char: "Le nom de l’étiquette ne doit pas dépasser 255 caractères",
      toast: {
        error: "Erreur lors de la mise à jour de l’étiquette",
      },
      description: "Créez des étiquettes personnalisées pour catégoriser et organiser vos éléments de travail",
      heading: "Étiquettes",
    },
    estimates: {
      label: "Estimations",
      title: "Activer les estimations pour mon projet",
      description: "Elles vous aident à communiquer la complexité et la charge de travail de l’équipe.",
      no_estimate: "Sans estimation",
      new: "Nouveau système d’estimation",
      create: {
        custom: "Personnalisé",
        start_from_scratch: "Commencer depuis zéro",
        choose_template: "Choisir un modèle",
        choose_estimate_system: "Choisir un système d’estimation",
        enter_estimate_point: "Saisir une estimation",
        step: "Étape {step} de {total}",
        label: "Créer une estimation",
      },
      toasts: {
        created: {
          success: {
            title: "Estimation créée",
            message: "L’estimation a été créée avec succès",
          },
          error: {
            title: "Échec de la création de l’estimation",
            message: "Nous n’avons pas pu créer la nouvelle estimation, veuillez réessayer.",
          },
        },
        updated: {
          success: {
            title: "Estimation modifiée",
            message: "L’estimation a été mise à jour dans votre projet.",
          },
          error: {
            title: "Échec de la modification de l’estimation",
            message: "Nous n’avons pas pu modifier l’estimation, veuillez réessayer",
          },
        },
        enabled: {
          success: {
            title: "Succès !",
            message: "Les estimations ont été activées.",
          },
        },
        disabled: {
          success: {
            title: "Succès !",
            message: "Les estimations ont été désactivées.",
          },
          error: {
            title: "Erreur !",
            message: "L’estimation n’a pas pu être désactivée. Veuillez réessayer",
          },
        },
      },
      validation: {
        min_length: "L’estimation doit être supérieure à 0.",
        unable_to_process: "Nous ne pouvons pas traiter votre demande, veuillez réessayer.",
        numeric: "L’estimation doit être une valeur numérique.",
        character: "L’estimation doit être une valeur de caractère.",
        empty: "La valeur de l’estimation ne peut pas être vide.",
        already_exists: "La valeur de l’estimation existe déjà.",
        unsaved_changes:
          "Vous avez des modifications non enregistrées. Veuillez les enregistrer avant de cliquer sur Terminé",
        remove_empty:
          "L’estimation ne peut pas être vide. Saisissez une valeur dans chaque champ ou supprimez ceux pour lesquels vous n’avez pas de valeurs.",
      },
      systems: {
        points: {
          label: "Points",
          fibonacci: "Fibonacci",
          linear: "Linéaire",
          squares: "Carrés",
          custom: "Personnalisé",
        },
        categories: {
          label: "Catégories",
          t_shirt_sizes: "Tailles de T-Shirt",
          easy_to_hard: "Facile à difficile",
          custom: "Personnalisé",
        },
        time: {
          label: "Temps",
          hours: "Heures",
        },
      },
      enable_description: "Elles vous aident à communiquer sur la complexité et la charge de travail de l’équipe.",
      heading: "Estimations",
      list_title: "Liste des estimations",
      archived_title: "Estimations archivées",
      archived_description:
        "Les estimations ont évolué, voici les estimations que vous aviez dans vos anciennes versions et qui n’étaient plus utilisées. En savoir plus",
      archived_read_more: "ici.",
    },
    automations: {
      label: "Automatisations",
      "auto-archive": {
        title: "Archiver automatiquement les éléments de travail fermés",
        description: "Plane archivera automatiquement les éléments de travail qui ont été complétés ou annulés.",
        duration: "Archiver automatiquement les éléments de travail fermés depuis",
      },
      "auto-close": {
        title: "Fermer automatiquement les éléments de travail",
        description: "Plane fermera automatiquement les éléments de travail qui n’ont pas été complétés ou annulés.",
        duration: "Fermer automatiquement les éléments de travail inactifs depuis",
        auto_close_status: "Statut de fermeture automatique",
      },
      description:
        "Configurez des actions automatisées pour fluidifier la gestion de votre projet et réduire les tâches manuelles.",
      heading: "Automatisations",
      sub_issue_auto_close: {
        title: "Fermer automatiquement le parent une fois tous les sous-éléments terminés",
        description:
          "Lorsque tous les sous-éléments d'un élément de travail atteignent un état terminé ou annulé, fermer automatiquement le parent également.",
        close_parent_to: "Fermer le parent vers",
      },
      sub_issue_cascade_close: {
        title: "Fermer les sous-éléments restants lorsque le parent est fermé",
        description:
          "Lorsqu'un élément de travail passe à un état terminé ou annulé, fermer automatiquement ses sous-éléments directs également.",
      },
    },
    empty_state: {
      labels: {
        title: "Pas encore d’étiquettes",
        description: "Créez des étiquettes pour organiser et filtrer les éléments de travail dans votre projet.",
      },
      estimates: {
        title: "Pas encore de systèmes d’estimation",
        description: "Créez un ensemble d’estimations pour communiquer le volume de travail par élément de travail.",
        primary_button: "Ajouter un système d’estimation",
      },
    },
    features: {
      cycles: {
        title: "Cycles",
        short_title: "Cycles",
        description:
          "Planifiez le travail dans des périodes flexibles qui s'adaptent au rythme et au tempo uniques de ce projet.",
        toggle_title: "Activer les cycles",
        toggle_description: "Planifiez le travail dans des périodes ciblées.",
      },
      modules: {
        title: "Modules",
        short_title: "Modules",
        description: "Organisez le travail en sous-projets avec des chefs de projet et des responsables dédiés.",
        toggle_title: "Activer les modules",
        toggle_description: "Les membres du projet pourront créer et modifier des modules.",
      },
      views: {
        title: "Vues",
        short_title: "Vues",
        description:
          "Enregistrez des tris, des filtres et des options d'affichage personnalisés ou partagez-les avec votre équipe.",
        toggle_title: "Activer les vues",
        toggle_description: "Les membres du projet pourront créer et modifier des vues.",
      },
      pages: {
        title: "Pages",
        short_title: "Pages",
        description: "Créez et modifiez du contenu libre : notes, documents, n'importe quoi.",
        toggle_title: "Activer les pages",
        toggle_description: "Les membres du projet pourront créer et modifier des pages.",
      },
      intake: {
        title: "Réception",
        short_title: "Réception",
        description:
          "Permettez aux non-membres de partager des bugs, des commentaires et des suggestions ; sans perturber votre flux de travail.",
        toggle_title: "Activer la réception",
        toggle_description: "Permettre aux membres du projet de créer des demandes de réception dans l'application.",
      },
      time_tracking: {
        description:
          "Permettez aux membres du projet de consigner le temps passé sur les éléments de travail et de visualiser l’effort total par élément.",
        short_title: "Suivi du temps",
        title: "Suivi du temps",
        toggle_description:
          "Les membres du projet pourront consigner des entrées de temps sur les éléments de travail.",
        toggle_title: "Activer le suivi du temps",
      },
    },
    ai_assistant: {
      description:
        "Permettez aux membres d’ouvrir l’assistant IA intégré, limité aux éléments de travail, cycles, modules et pages de ce projet.",
      label: "Assistant IA",
      master_switch: "Activer l’assistant IA pour ce projet",
      master_switch_description: "Remplace le paramètre par défaut de l’espace de travail pour ce projet uniquement.",
      override: {
        inherit: "Hériter de l’espace de travail",
        off: "Forcer désactivé",
        on: "Forcer activé",
      },
      save_success: "Paramètres de l’assistant IA enregistrés.",
      workspace_disabled_tooltip:
        "L’assistant IA n’est pas encore activé pour cet espace de travail. Rendez-vous dans Paramètres > IA.",
    },
    ai_duplicate_detection: {
      description:
        "Signalez les éléments de travail probablement en double dans ce projet, en fonction de leur similarité avec des éléments existants.",
      label: "Détection de doublons par IA",
      master_switch: "Activer la détection de doublons pour ce projet",
      master_switch_description: "Remplace le paramètre par défaut de l’espace de travail pour ce projet uniquement.",
      override: {
        inherit: "Hériter de l’espace de travail",
        off: "Forcer désactivé",
        on: "Forcer activé",
      },
      save_success: "Paramètres de détection de doublons enregistrés.",
      threshold_scope_hint:
        "Le seuil de similarité et le périmètre de recherche se configurent à l’échelle de l’espace de travail, dans Paramètres > IA.",
      workspace_disabled_tooltip:
        "La détection de doublons n’est pas encore activée pour cet espace de travail. Rendez-vous dans Paramètres > IA.",
    },
    ai_triage: {
      auto_apply: "Application automatique",
      description:
        "Suggérez un module, des assignés et des étiquettes pour les nouveaux éléments de travail créés dans ce projet, en fonction de leur similarité avec des éléments passés.",
      field_assignees: "Assignés",
      field_labels: "Étiquettes",
      field_module: "Module",
      label: "Triage IA",
      master_switch: "Activer le triage IA pour ce projet",
      master_switch_description: "Remplace le paramètre par défaut de l’espace de travail pour ce projet uniquement.",
      max_labels_suggested: "Nombre max. d’étiquettes suggérées",
      min_historical_issues: "Nombre min. d’éléments historiques requis",
      override: {
        inherit: "Hériter de l’espace de travail",
        off: "Forcer désactivé",
        on: "Forcer activé",
      },
      save_success: "Paramètres de triage IA enregistrés.",
      workspace_disabled_tooltip:
        "Le triage automatique assisté par IA n’est pas encore activé pour cet espace de travail. Rendez-vous dans Paramètres > IA.",
    },
    governed_workflows: {
      label: "Workflows",
    },
    recurring_issue_templates: {
      label: "Éléments de travail récurrents",
    },
  },
  project_cycles: {
    add_cycle: "Ajouter un cycle",
    more_details: "Plus de détails",
    cycle: "Cycle",
    update_cycle: "Mettre à jour le cycle",
    create_cycle: "Créer un cycle",
    no_matching_cycles: "Aucun cycle correspondant",
    remove_filters_to_see_all_cycles: "Supprimez les filtres pour voir tous les cycles",
    remove_search_criteria_to_see_all_cycles: "Supprimez les critères de recherche pour voir tous les cycles",
    only_completed_cycles_can_be_archived: "Seuls les cycles terminés peuvent être archivés",
    start_date: "Date de début",
    end_date: "Date de fin",
    in_your_timezone: "Dans votre fuseau horaire",
    transfer_work_items: "Transférer {count} éléments de travail",
    date_range: "Plage de dates",
    add_date: "Ajouter une date",
    active_cycle: {
      label: "Cycle actif",
      progress: "Progression",
      chart: "Graphique d’avancement",
      priority_issue: "Éléments de travail prioritaires",
      assignees: "Assignés",
      issue_burndown: "Graphique d’avancement des éléments",
      ideal: "Idéal",
      current: "Actuel",
      labels: "Étiquettes",
    },
    upcoming_cycle: {
      label: "Cycle à venir",
    },
    completed_cycle: {
      label: "Cycle terminé",
    },
    status: {
      days_left: "Jours restants",
      completed: "Terminé",
      yet_to_start: "Pas encore commencé",
      in_progress: "En cours",
      draft: "Brouillon",
    },
    action: {
      restore: {
        title: "Restaurer le cycle",
        success: {
          title: "Cycle restauré",
          description: "Le cycle a été restauré.",
        },
        failed: {
          title: "Échec de la restauration du cycle",
          description: "Le cycle n’a pas pu être restauré. Veuillez réessayer.",
        },
      },
      favorite: {
        loading: "Ajout du cycle aux favoris",
        success: {
          description: "Cycle ajouté aux favoris.",
          title: "Succès !",
        },
        failed: {
          description: "Impossible d’ajouter le cycle aux favoris. Veuillez réessayer.",
          title: "Erreur !",
        },
      },
      unfavorite: {
        loading: "Suppression du cycle des favoris",
        success: {
          description: "Cycle retiré des favoris.",
          title: "Succès !",
        },
        failed: {
          description: "Impossible de retirer le cycle des favoris. Veuillez réessayer.",
          title: "Erreur !",
        },
      },
      update: {
        loading: "Mise à jour du cycle",
        success: {
          description: "Cycle mis à jour avec succès.",
          title: "Succès !",
        },
        failed: {
          description: "Erreur lors de la mise à jour du cycle. Veuillez réessayer.",
          title: "Erreur !",
        },
        error: {
          already_exists:
            "Vous avez déjà un cycle aux dates indiquées. Si vous souhaitez créer un cycle en brouillon, vous pouvez le faire en supprimant les deux dates.",
        },
      },
    },
    empty_state: {
      general: {
        title: "Regroupez et planifiez votre travail en Cycles.",
        description:
          "Découpez le travail en périodes définies, planifiez à rebours depuis la date limite de votre projet pour fixer les dates, et progressez concrètement en équipe.",
        primary_button: {
          text: "Définissez votre premier cycle",
          comic: {
            title: "Les cycles sont des périodes répétitives.",
            description:
              "Un sprint, une itération, ou tout autre terme que vous utilisez pour le suivi hebdomadaire ou bimensuel du travail est un cycle.",
          },
        },
      },
      no_issues: {
        title: "Aucun élément de travail ajouté au cycle",
        description: "Ajoutez ou créez des éléments de travail que vous souhaitez planifier et livrer dans ce cycle",
        primary_button: {
          text: "Créer un nouvel élément de travail",
        },
        secondary_button: {
          text: "Ajouter un élément existant",
        },
      },
      completed_no_issues: {
        title: "Aucun élément de travail dans le cycle",
        description:
          "Aucun élément de travail dans le cycle. Les éléments sont soit transférés soit masqués. Pour voir les éléments masqués s’il y en a, mettez à jour vos propriétés d’affichage en conséquence.",
      },
      active: {
        title: "Aucun cycle actif",
        description:
          "Un cycle actif inclut toute période qui englobe la date d’aujourd’hui dans sa plage. Trouvez ici la progression et les détails du cycle actif.",
      },
      archived: {
        title: "Aucun cycle archivé pour le moment",
        description: "Pour organiser votre projet, archivez les cycles terminés. Retrouvez-les ici une fois archivés.",
      },
    },
    end_cycle: "Terminer le cycle",
    end_cycle_modal: {
      description_no_pending_items: "Voulez-vous vraiment terminer « {name} » ?",
      description_with_pending_items:
        "« {name} » comporte {count} éléments de travail incomplets. Vous pouvez les transférer vers un autre cycle avant de le terminer, ou les laisser tels quels.",
      end_cycle_action: "Terminer le cycle",
      end_without_transfer: "Terminer sans transférer",
      no_matching_cycles: "Vous n’avez aucun autre cycle actif ou à venir vers lequel transférer.",
      title: "Terminer le cycle",
      transfer_and_pick_cycle: "Choisissez un cycle vers lequel transférer les éléments de travail",
    },
    start_cycle: "Démarrer le cycle",
  },
  project_issues: {
    empty_state: {
      no_issues: {
        title: "Créez un élément de travail et assignez-le à quelqu’un, même à vous-même",
        description:
          "Pensez aux éléments de travail comme des tâches, du travail, ou des JTBD (Jobs To Be Done). Un élément de travail et ses sous-éléments sont généralement des actions temporelles assignées aux membres de votre équipe. Votre équipe crée, assigne et complète des éléments de travail pour faire progresser votre projet vers son objectif.",
        primary_button: {
          text: "Créez votre premier élément de travail",
          comic: {
            title: "Les éléments de travail sont les blocs de construction dans Plane.",
            description:
              "Refondre l’interface de Plane, Renouveler l’image de marque de l’entreprise, ou Lancer le nouveau système d’injection de carburant sont des exemples d’éléments de travail qui ont probablement des sous-éléments.",
          },
        },
      },
      no_archived_issues: {
        title: "Aucun élément de travail archivé pour le moment",
        description:
          "Manuellement ou par automatisation, vous pouvez archiver les éléments de travail terminés ou annulés. Retrouvez-les ici une fois archivés.",
        primary_button: {
          text: "Configurer l’automatisation",
        },
      },
      issues_empty_filter: {
        title: "Aucun élément de travail trouvé correspondant aux filtres appliqués",
        secondary_button: {
          text: "Effacer tous les filtres",
        },
      },
    },
  },
  project_module: {
    add_module: "Ajouter un module",
    update_module: "Mettre à jour le module",
    create_module: "Créer un module",
    archive_module: "Archiver le module",
    restore_module: "Restaurer le module",
    delete_module: "Supprimer le module",
    empty_state: {
      general: {
        title: "Associez vos jalons de projet aux Modules et suivez facilement le travail agrégé.",
        description:
          "Un groupe d’éléments de travail qui appartiennent à un parent logique et hiérarchique forme un module. Considérez-les comme un moyen de suivre le travail par étapes clés du projet. Ils ont leurs propres périodes et délais ainsi que des analyses pour vous aider à voir à quel point vous êtes proche ou pas d’atteindre une étape clé.",
        primary_button: {
          text: "Construisez votre premier module",
          comic: {
            title: "Les modules aident à regrouper le travail par étapes clés.",
            description:
              "Un module « panier », un module « châssis » et un module « entrepôt » sont tous de bons exemples de ce regroupement.",
          },
        },
      },
      no_issues: {
        title: "Aucun élément de travail dans le module",
        description: "Créez ou ajoutez des éléments de travail que vous souhaitez accomplir dans le cadre de ce module",
        primary_button: {
          text: "Créer de nouveaux éléments de travail",
        },
        secondary_button: {
          text: "Ajouter un élément existant",
        },
      },
      archived: {
        title: "Aucun module archivé pour le moment",
        description:
          "Pour organiser votre projet, archivez les modules terminés ou annulés. Retrouvez-les ici une fois archivés.",
      },
      sidebar: {
        in_active: "Ce module n’est pas encore actif.",
        invalid_date: "Date invalide. Veuillez entrer une date valide.",
      },
    },
    quick_actions: {
      archive_module: "Archiver le module",
      archive_module_description: "Seuls les modules terminés ou\nannulés peuvent être archivés.",
      delete_module: "Supprimer le module",
    },
    toast: {
      copy: {
        success: "Lien du module copié dans le presse-papiers",
      },
      delete: {
        success: "Module supprimé avec succès",
        error: "Échec de la suppression du module",
      },
    },
    delete_modal: {
      content_prefix: "Êtes-vous sûr de vouloir supprimer le module",
      content_suffix:
        " ? Toutes les données liées au module seront définitivement supprimées. Cette action est irréversible.",
    },
  },
  project_views: {
    empty_state: {
      general: {
        title: "Enregistrez des vues filtrées pour votre projet. Créez-en autant que nécessaire",
        description:
          "Les vues sont un ensemble de filtres enregistrés que vous utilisez fréquemment ou auxquels vous souhaitez avoir un accès facile. Tous les acteurs d’un projet peuvent voir les vues de chacun et choisir celle qui convient le mieux à leurs besoins.",
        primary_button: {
          text: "Créez votre première vue",
          comic: {
            title: "Les vues fonctionnent sur les propriétés des éléments de travail.",
            description: "Vous pouvez créer une vue ici avec autant de propriétés comme filtres que souhaité.",
          },
        },
      },
      filter: {
        title: "Aucune vue correspondante",
        description: "Aucune vue ne correspond aux critères de recherche. \n Créez plutôt une nouvelle vue.",
      },
    },
    delete_view: {
      title: "Êtes-vous sûr de vouloir supprimer cette vue ?",
      content:
        "Si vous confirmez, toutes les options de tri, de filtrage et d’affichage et la mise en page que vous avez choisie pour cette vue seront définitivement supprimées sans possibilité de les restaurer.",
    },
  },
  project_page: {
    empty_state: {
      general: {
        title:
          "Rédigez une note, un document ou une base de connaissances complète. Obtenez l’aide de Galileo, l’assistant IA de Plane, pour commencer",
        description:
          "Les Pages sont un espace de réflexion dans Plane. Prenez des notes de réunion, formatez-les facilement, intégrez des éléments de travail, disposez-les à l’aide d’une bibliothèque de composants, et gardez-les tous dans le contexte de votre projet. Pour faciliter la rédaction de tout document, faites appel à Galileo, l’IA de Plane, avec un raccourci ou un clic sur un bouton.",
        primary_button: {
          text: "Créez votre première page",
        },
      },
      private: {
        title: "Pas encore de pages privées",
        description:
          "Ici vos écrits sont personnels et privés. Quand vous serez prêt à les partager, l'équipe n’est qu’à un clic.",
        primary_button: {
          text: "Créez votre première page",
        },
      },
      public: {
        title: "Pas encore de pages publiques",
        description: "Consultez ici les pages partagées avec tout le monde dans votre projet.",
        primary_button: {
          text: "Créez votre première page",
        },
      },
      archived: {
        title: "Pas encore de pages archivées",
        description: "Archivez les pages qui ne sont pas dans votre radar. Accédez-y ici quand nécessaire.",
      },
    },
  },
  command_k: {
    empty_state: {
      search: {
        title: "Aucun résultat trouvé",
      },
    },
  },
  issue_relation: {
    empty_state: {
      search: {
        title: "Aucun élément de travail correspondant trouvé",
      },
      no_issues: {
        title: "Aucun élément de travail trouvé",
      },
    },
  },
  issue_comment: {
    empty_state: {
      general: {
        title: "Pas encore de commentaires",
        description:
          "Les commentaires peuvent être utilisés comme espace de discussion et de suivi pour les éléments de travail",
      },
    },
  },
  notification: {
    label: "Boîte de réception",
    page_label: "{workspace} - Boîte de réception",
    options: {
      mark_all_as_read: "Tout marquer comme lu",
      mark_read: "Marquer comme lu",
      mark_unread: "Marquer comme non lu",
      refresh: "Actualiser",
      filters: "Filtres de la boîte de réception",
      show_unread: "Afficher les non lus",
      show_snoozed: "Afficher les reportés",
      show_archived: "Afficher les archivés",
      mark_archive: "Archiver",
      mark_unarchive: "Désarchiver",
      mark_snooze: "Reporter",
      mark_unsnooze: "Annuler le report",
    },
    toasts: {
      read: "Notification marquée comme lue",
      unread: "Notification marquée comme non lue",
      archived: "Notification marquée comme archivée",
      unarchived: "Notification marquée comme non archivée",
      snoozed: "Notification reportée",
      unsnoozed: "Report de la notification annulé",
    },
    empty_state: {
      detail: {
        title: "Sélectionnez pour voir les détails.",
      },
      all: {
        title: "Aucun élément de travail assigné",
        description: "Les mises à jour des éléments de travail qui vous sont assignés peuvent être \n vues ici",
      },
      mentions: {
        title: "Aucun élément de travail assigné",
        description: "Les mises à jour des éléments de travail qui vous sont assignés peuvent être \n vues ici",
      },
    },
    tabs: {
      all: "Tout",
      mentions: "Mentions",
    },
    filter: {
      assigned: "Assigné à moi",
      created: "Créé par moi",
      subscribed: "Suivi par moi",
    },
    snooze: {
      "1_day": "1 jour",
      "3_days": "3 jours",
      "5_days": "5 jours",
      "1_week": "1 semaine",
      "2_weeks": "2 semaines",
      custom: "Personnalisé",
    },
    snooze_modal: {
      am: "AM",
      date_required: "Veuillez sélectionner une date",
      no_available_time: "Aucun horaire disponible pour cette date.",
      pick_a_date: "Choisir une date",
      pick_a_time: "Choisir une heure",
      pm: "PM",
      select_date: "Sélectionner une date",
      select_time: "Sélectionner une heure",
      submitting: "Envoi en cours...",
      time_required: "Veuillez sélectionner une heure",
      title: "Personnaliser la durée de report",
    },
  },
  active_cycle: {
    empty_state: {
      progress: {
        title: "Ajoutez des éléments de travail au cycle pour voir sa progression",
      },
      chart: {
        title: "Ajoutez des éléments de travail au cycle pour voir le graphique d’avancement.",
      },
      priority_issue: {
        title: "Visualisez en un coup d’œil les éléments de travail prioritaires traités dans le cycle.",
      },
      assignee: {
        title: "Ajoutez des acteurs aux éléments de travail pour voir une répartition du travail par acteur.",
      },
      label: {
        title: "Ajoutez des étiquettes aux éléments de travail pour voir la répartition du travail par étiquette.",
      },
    },
  },
  disabled_project: {
    empty_state: {
      inbox: {
        title: "L’Intake n’est pas activé pour le projet.",
        description:
          "L’Intake vous aide à gérer les demandes entrantes dans votre projet et à les ajouter comme éléments de travail dans votre flux. Activez l’Intake depuis les paramètres du projet pour gérer les demandes.",
        primary_button: {
          text: "Gérer les fonctionnalités",
        },
      },
      cycle: {
        title: "Les Cycles ne sont pas activés pour ce projet.",
        description:
          "Découpez le travail en segments temporels, planifiez à rebours depuis la date d’échéance de votre projet pour définir les étapes, et progressez concrètement en équipe. Activez la fonctionnalité Cycles pour votre projet pour commencer à les utiliser.",
        primary_button: {
          text: "Gérer les fonctionnalités",
        },
      },
      module: {
        title: "Les Modules ne sont pas activés pour le projet.",
        description:
          "Les Modules sont les éléments constitutifs de votre projet. Activez les modules depuis les paramètres du projet pour commencer à les utiliser.",
        primary_button: {
          text: "Gérer les fonctionnalités",
        },
      },
      page: {
        title: "Les Pages ne sont pas activées pour le projet.",
        description:
          "Les Pages sont les éléments constitutifs de votre projet. Activez les pages depuis les paramètres du projet pour commencer à les utiliser.",
        primary_button: {
          text: "Gérer les fonctionnalités",
        },
      },
      view: {
        title: "Les Vues ne sont pas activées pour le projet.",
        description:
          "Les Vues sont les éléments constitutifs de votre projet. Activez les vues depuis les paramètres du projet pour commencer à les utiliser.",
        primary_button: {
          text: "Gérer les fonctionnalités",
        },
      },
    },
  },
  workspace_draft_issues: {
    draft_an_issue: "Créer un brouillon d’élément de travail",
    empty_state: {
      title: "Les éléments de travail partiellement rédigés, et bientôt les commentaires, apparaîtront ici.",
      description:
        "Pour essayer, commencez à ajouter un élément de travail et laissez-le à mi-chemin ou créez votre premier brouillon ci-dessous. 😉",
      primary_button: {
        text: "Créez votre premier brouillon",
      },
    },
    delete_modal: {
      title: "Supprimer le brouillon",
      description: "Êtes-vous sûr de vouloir supprimer ce brouillon ? Cette action ne peut pas être annulée.",
    },
    toasts: {
      created: {
        success: "Brouillon créé",
        error: "L’élément de travail n’a pas pu être créé. Veuillez réessayer.",
      },
      deleted: {
        success: "Brouillon supprimé",
      },
    },
  },
  stickies: {
    title: "Vos post-it",
    placeholder: "cliquez pour écrire ici",
    all: "Toutes les post-it",
    "no-data": "Notez une idée, saisissez une intuition ou captez une inspiration. Ajoutez un post-it pour commencer.",
    add: "Ajouter un post-it",
    search_placeholder: "Rechercher par titre",
    delete: "Supprimer le post-it",
    delete_confirmation: "Êtes-vous sûr de vouloir supprimer ce post-it ?",
    empty_state: {
      simple: "Notez une idée, saisissez une intuition ou captez une inspiration. Ajoutez un post-it pour commencer.",
      general: {
        title: "Les post-it sont des notes rapides et des tâches que vous prenez à la volée.",
        description:
          "Capturez vos pensées et idées facilement en créant des post-it que vous pouvez consulter à tout moment et de n’importe où.",
        primary_button: {
          text: "Ajouter un post-it",
        },
      },
      search: {
        title: "Cela ne correspond à aucun de vos post-it.",
        description:
          "Essayez un terme différent ou faites-nous savoir\nsi vous êtes sûr que votre recherche est correcte.",
        primary_button: {
          text: "Ajouter un post-it",
        },
      },
    },
    toasts: {
      errors: {
        wrong_name: "Le nom du post-it ne peut pas dépasser 100 caractères.",
        already_exists: "Il existe déjà un post-it sans description",
      },
      created: {
        title: "Post-it créé",
        message: "Le post-it a été créé avec succès",
      },
      not_created: {
        title: "Post-it non créé",
        message: "Le post-it n’a pas pu être créé",
      },
      updated: {
        title: "Post-it mis à jour",
        message: "Le post-it a été mis à jour avec succès",
      },
      not_updated: {
        title: "Post-it non mis à jour",
        message: "Le post-it n’a pas pu être mis à jour",
      },
      removed: {
        title: "Post-it supprimé",
        message: "Le post-it a été supprimé avec succès",
      },
      not_removed: {
        title: "Post-it non supprimé",
        message: "Le post-it n’a pas pu être supprimé",
      },
    },
  },
  role_details: {
    guest: {
      title: "Invité",
      description: "Les membres externes des organisations peuvent être invités en tant qu’invités.",
    },
    member: {
      title: "Membre",
      description: "Capacité à lire, écrire, modifier et supprimer des entités dans les projets, cycles et modules",
    },
    admin: {
      title: "Administrateur",
      description: "Toutes les permissions sont activées dans l’espace de travail.",
    },
  },
  user_roles: {
    product_or_project_manager: "Chef de produit / Chef de projet",
    development_or_engineering: "Développement / Ingénierie",
    founder_or_executive: "Fondateur / Dirigeant",
    freelancer_or_consultant: "Freelance / Consultant",
    marketing_or_growth: "Marketing / Croissance",
    sales_or_business_development: "Ventes / Développement commercial",
    support_or_operations: "Support / Opérations",
    student_or_professor: "Étudiant / Professeur",
    human_resources: "Ressources Humaines",
    other: "Autre",
  },
  importer: {
    github: {
      title: "GitHub",
      description: "Importez des éléments de travail depuis les dépôts GitHub et synchronisez-les.",
    },
    jira: {
      title: "Jira",
      description: "Importez des éléments de travail et des epics depuis les projets et epics Jira.",
    },
  },
  exporter: {
    csv: {
      title: "CSV",
      description: "Exportez les éléments de travail vers un fichier CSV.",
      short_description: "Exporter en csv",
    },
    excel: {
      title: "Excel",
      description: "Exportez les éléments de travail vers un fichier Excel.",
      short_description: "Exporter en excel",
    },
    xlsx: {
      title: "Excel",
      description: "Exportez les éléments de travail vers un fichier Excel.",
      short_description: "Exporter en excel",
    },
    json: {
      title: "JSON",
      description: "Exportez les éléments de travail vers un fichier JSON.",
      short_description: "Exporter en json",
    },
  },
  default_global_view: {
    all_issues: "Tous les éléments de travail",
    assigned: "Assignés",
    created: "Créés",
    subscribed: "Suivis",
  },
  themes: {
    theme_options: {
      system_preference: {
        label: "Préférence système",
      },
      light: {
        label: "Clair",
      },
      dark: {
        label: "Sombre",
      },
      light_contrast: {
        label: "Contraste clair élevé",
      },
      dark_contrast: {
        label: "Contraste sombre élevé",
      },
      custom: {
        label: "Thème personnalisé",
      },
    },
  },
  project_modules: {
    status: {
      backlog: "Backlog",
      planned: "Planifié",
      in_progress: "En cours",
      paused: "En pause",
      completed: "Terminé",
      cancelled: "Annulé",
    },
    layout: {
      list: "Vue liste",
      board: "Vue galerie",
      timeline: "Vue chronologique",
    },
    order_by: {
      name: "Nom",
      progress: "Progression",
      issues: "Nombre d’éléments de travail",
      due_date: "Date d’échéance",
      created_at: "Date de création",
      manual: "Manuel",
    },
  },
  cycle: {
    label: "{count, plural, one {Cycle} other {Cycles}}",
    no_cycle: "Pas de cycle",
    auto_schedule: {
      title: "Planification automatique",
      description: "Créez automatiquement les prochains cycles selon une cadence récurrente.",
      enable_title: "Activer la planification automatique",
      enable_description:
        "Un nouveau cycle sera créé dès que le nombre de cycles à venir passe sous le seuil configuré.",
      cadence_title: "Cadence",
      cadence_description: "Durée de chaque cycle auto-planifié, en semaines (1-12).",
      start_day_title: "Jour de démarrage",
      start_day_description: "Jour de la semaine auquel chaque nouveau cycle commence.",
      cooldown_title: "Délai de battement",
      cooldown_description: "Nombre de jours de battement entre la fin d'un cycle et le début du suivant (0-14).",
      lookahead_title: "Anticipation",
      lookahead_description: "Nombre de cycles futurs à toujours garder déjà créés d'avance (1-3).",
      naming_template_title: "Gabarit de nom",
      naming_template_description: "Le texte {number} est remplacé par le numéro de cycle auto-incrémenté.",
      rollover_title: "Transfert automatique (rollover)",
      rollover_description:
        "À la clôture d'un cycle auto-planifié, transfère ses work items non terminés vers le suivant.",
      preview_button: "Prévisualiser les prochains cycles",
      save_error: "Impossible d'enregistrer les paramètres de planification automatique. Veuillez réessayer.",
      preview_error: "Impossible de calculer l'aperçu.",
    },
    delete_modal: {
      success_message: "Cycle supprimé avec succès.",
      warning_title: "Attention !",
      generic_error: "Une erreur s'est produite, veuillez réessayer plus tard.",
      title: "Supprimer le cycle",
      content:
        "Êtes-vous sûr de vouloir supprimer le cycle « {name} » ? Toutes les données liées à ce cycle seront définitivement supprimées. Cette action est irréversible.",
    },
    transfer_issues_modal: {
      title: "Transférer les éléments de travail",
      search_placeholder: "Rechercher un cycle...",
      toast: {
        success: {
          title: "Succès !",
          message: "Les éléments de travail ont été transférés avec succès",
        },
        error: {
          title: "Erreur !",
          message: "Impossible de transférer les éléments de travail. Veuillez réessayer.",
        },
        fetch_error: {
          title: "Erreur",
          message: "Impossible de récupérer les détails du cycle",
        },
      },
      empty_state: "Vous n’avez aucun cycle en cours. Veuillez en créer un pour transférer les éléments de travail.",
    },
  },
  module: {
    label: "{count, plural, one {Module} other {Modules}}",
    no_module: "Pas de module",
    links: {
      toasts: {
        created: "Le lien du module a été créé avec succès.",
        updated: "Le lien du module a été mis à jour avec succès.",
      },
    },
  },
  description_versions: {
    last_edited_by: "Dernière modification par",
    previously_edited_by: "Précédemment modifié par",
    edited_by: "Modifié par",
  },
  self_hosted_maintenance_message: {
    title: "Il semblerait que Plane n'ait pas démarré correctement !",
    description:
      "Certains services n'ont peut-être pas réussi à démarrer. Veuillez consulter les logs de vos conteneurs pour identifier et résoudre le problème. Si vous êtes bloqué, contactez notre équipe de support pour obtenir de l'aide.",
    plane_didnt_start_up_this_could_be_because_one_or_more_plane_services_failed_to_start:
      "Plane n’a pas démarré. Cela pourrait être dû au fait qu’un ou plusieurs services Plane ont échoué à démarrer.",
    choose_view_logs_from_setup_sh_and_docker_logs_to_be_sure:
      "Choisissez View Logs depuis setup.sh et les logs Docker pour en être sûr.",
  },
  page_navigation_pane: {
    tabs: {
      outline: {
        label: "Plan",
        empty_state: {
          title: "Titres manquants",
          description: "Ajoutons quelques titres à cette page pour les voir ici.",
        },
      },
      info: {
        label: "Info",
        document_info: {
          words: "Mots",
          characters: "Caractères",
          paragraphs: "Paragraphes",
          read_time: "Temps de lecture",
        },
        actors_info: {
          edited_by: "Modifié par",
          created_by: "Créé par",
        },
        version_history: {
          label: "Historique des versions",
          current_version: "Version actuelle",
        },
      },
      assets: {
        label: "Ressources",
        download_button: "Télécharger",
        empty_state: {
          title: "Images manquantes",
          description: "Ajoutez des images pour les voir ici.",
        },
      },
    },
    open_button: "Ouvrir le panneau de navigation",
    close_button: "Fermer le panneau de navigation",
    outline_floating_button: "Ouvrir le plan",
  },
  customers: {
    contact_email: "E-mail de contact",
    contact_name: "Nom du contact",
    create_customer: "Créer un client",
    delete_confirm: {
      description:
        "Êtes-vous sûr de vouloir supprimer ce client ? Ses demandes seront également supprimées. Les éléments de travail liés ne seront pas affectés. Cette action est irréversible.",
      title: "Supprimer le client",
    },
    delete_request_confirm: {
      description: "Êtes-vous sûr de vouloir supprimer cette demande ? Cette action est irréversible.",
      title: "Supprimer la demande",
    },
    description: "Description",
    domain: "Domaine / site web",
    empty_state: {
      description:
        "Créez une fiche client pour commencer à suivre ses demandes et les éléments de travail qui y répondent.",
      primary_button: "Créer votre premier client",
      title: "Aucun client pour le moment",
    },
    label: "Clients",
    link_work_item: "Lier un élément de travail",
    name: "Nom",
    new_request: "Nouvelle demande",
    request_description: "Demande / devis",
    request_name: "Titre",
    requests: "Demandes",
    requests_empty_state: {
      description: "Créez la première demande pour commencer à suivre ce que ce client a sollicité.",
      title: "Aucune demande pour le moment",
    },
    status: "Statut",
    status_active: "Actif",
    status_all: "Tous",
    status_churned: "Perdu",
    status_prospect: "Prospect",
    toast: {
      create_success: "Client créé avec succès",
      delete_success: "Client supprimé avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      link_success: "Élément de travail lié avec succès",
      request_create_success: "Demande créée avec succès",
      request_delete_success: "Demande supprimée avec succès",
      unlink_success: "Élément de travail dissocié avec succès",
      update_success: "Client mis à jour avec succès",
    },
    update_customer: "Mettre à jour le client",
    work_items: "Éléments de travail",
  },
  project_templates: {
    delete_confirm: {
      description:
        "Êtes-vous sûr de vouloir supprimer ce modèle de projet ? Les projets déjà créés à partir de celui-ci ne seront pas affectés.",
      title: "Supprimer le modèle de projet",
    },
    description: "Description",
    empty_state: {
      description:
        "Enregistrez un projet existant bien organisé en tant que modèle pour standardiser la création de nouveaux projets.",
      title: "Aucun modèle de projet pour le moment",
    },
    include_current_work_items: "Inclure les éléments de travail actuels de ce projet",
    include_current_work_items_hint:
      "Désactivé par défaut, pour éviter de dupliquer accidentellement un backlog de production.",
    issues_count: "{count} éléments de départ",
    label: "Modèles de projet",
    labels_count: "{count} étiquettes",
    name: "Nom du modèle",
    save_as_template: "Enregistrer comme modèle",
    settings: {
      description:
        "Des plans réutilisables (états, étiquettes, membres, éléments de travail de départ) pour vos nouveaux projets.",
      title: "Modèles de projet",
    },
    start_from_scratch: "Partir de zéro",
    start_from_template: "Partir d’un modèle",
    states_count: "{count} états",
    toast: {
      delete_success: "Modèle de projet supprimé avec succès",
      duplicate_success: "Modèle de projet dupliqué avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      save_success: "Modèle de projet enregistré avec succès",
    },
    usage_count: "Utilisé {count} fois",
    use_template: "Utiliser le modèle",
  },
  digest: {
    admin: {
      description:
        "Contrôles à l’échelle de l’espace de travail pour la fonctionnalité de digest périodique. Chaque membre configure sa propre fréquence, sa portée et ses canaux depuis sa page Digests.",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      feature_enabled_hint:
        "Désactiver cette option arrête la génération planifiée pour tous les membres, quels que soient leurs réglages personnels.",
      feature_enabled_label: "Activer le digest périodique pour cet espace de travail",
      save_success: "Paramètres du digest enregistrés.",
      title: "Digest périodique",
    },
    detail: {
      item_types: {
        COMMENT_MENTION: "Commentaires vous mentionnant",
        CYCLE_COMPLETED: "Cycles terminés",
        CYCLE_SCOPE_CHANGED: "Changements de périmètre de cycle",
        CYCLE_STARTED: "Cycles démarrés",
        ISSUE_COMPLETED: "Éléments de travail terminés / annulés",
        ISSUE_CREATED: "Éléments de travail créés",
        ISSUE_STATE_CHANGED: "Changements de statut significatifs",
      },
      no_items: "Aucune activité sur cette période.",
      summary_title: "Résumé",
    },
    empty_state: {
      no_digests_description:
        "Activez le digest périodique ci-dessous, ou envoyez-vous un aperçu pour voir à quoi il ressemble.",
      no_digests_title: "Aucun digest pour l’instant",
      no_selection: "Sélectionnez un digest pour en afficher les détails.",
    },
    frequency: {
      DAILY: "Quotidien",
      WEEKLY: "Hebdomadaire",
    },
    generation_method: {
      LLM: "Enrichi par IA",
      TEMPLATE: "Basé sur un modèle",
    },
    item_count: "{count} mise(s) à jour",
    label: "Digests",
    nav: {
      back_to_inbox: "Retour à la boîte de réception",
      open_digests: "Digests",
    },
    overview: {
      configure: "Configurer",
      description:
        "Un résumé de l’activité pertinente par espace de travail, livré dans l’application et par e-mail selon votre propre planning.",
      heading: "Digest périodique",
      loading_error: "Impossible de charger le statut du digest de cet espace de travail.",
      status_off: "Désactivé",
      status_on_in_app: "{frequency} - dans l’application",
      status_on_in_app_email: "{frequency} - dans l’application + e-mail",
    },
    page_label: "{workspace} - Digests",
    preferences: {
      channel_email: "E-mail",
      channel_in_app: "Dans l’application (toujours activé, gratuit)",
      channels_label: "Canaux",
      custom_projects_label: "Projets",
      day_of_week_label: "Jour de la semaine",
      description:
        "Un résumé de l’activité pertinente par espace de travail - éléments de travail créés/terminés, changements de statut significatifs, mentions en commentaire, et démarrage/fin/changements de périmètre des cycles - selon votre propre planning.",
      disabled_by_workspace:
        "La fonctionnalité de digest a été désactivée pour cet espace de travail par un administrateur.",
      enabled_label: "M’envoyer un digest périodique",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      frequency_label: "Fréquence",
      preview_button: "Envoyer un aperçu maintenant",
      preview_empty: "Aucune activité correspondante n’a été trouvée pour la période d’aperçu.",
      preview_rate_limited: "Vous avez atteint la limite d’aperçus (3 par heure). Veuillez réessayer plus tard.",
      preview_success: "Aperçu du digest généré - consultez-le ci-dessous.",
      save: "Enregistrer",
      save_success: "Préférences de digest enregistrées.",
      scope: {
        ALL_PROJECTS: "Tous mes projets",
        CUSTOM: "Sélection personnalisée",
        FAVORITES_ONLY: "Favoris uniquement",
      },
      scope_label: "Portée",
      time_label: "Heure de livraison (votre fuseau horaire local)",
      title: "Digest périodique",
      weekday: {
        "0": "lundi",
        "1": "mardi",
        "2": "mercredi",
        "3": "jeudi",
        "4": "vendredi",
        "5": "samedi",
        "6": "dimanche",
      },
    },
    settings_button: "Paramètres du digest",
    status: {
      FAILED: "Échoué",
      GENERATED: "Généré",
      PENDING: "En attente",
      SENT: "Envoyé",
      SKIPPED_EMPTY: "Rien à signaler",
    },
  },
  project_updates: {
    ai_draft: {
      badge_label: "Rédigé avec l’aide de l’IA",
      badge_tooltip: "Généré le {date} avec {model}",
      error: "Impossible de générer un brouillon. Vous pouvez toujours rédiger cette mise à jour manuellement.",
      generating: "Génération d’un brouillon... cela peut prendre jusqu’à 20 secondes.",
      limit_reached:
        "Limite de régénération atteinte. Publiez le brouillon actuel, ou commencez-en un nouveau après la publication.",
      regenerate: "Régénérer",
      regenerations_used: "{count}/{max} régénérations utilisées",
      suggested_status_hint: "Statut suggéré par l’IA - modifiez-le s’il ne convient pas.",
      unknown_model: "un modèle inconnu",
    },
    audit_log: {
      empty: "Aucune tentative de génération par IA pour le moment.",
      title: "Journal de génération IA",
      view_link: "Voir les journaux de génération IA",
    },
    delete_confirm: {
      description: "Êtes-vous sûr de vouloir supprimer cette mise à jour de statut ? Cette action est irréversible.",
      title: "Supprimer la mise à jour",
    },
    generate_draft: "Générer un brouillon avec l’IA",
    label: "Mises à jour",
    no_updates_yet: "Aucune mise à jour de statut pour le moment",
    overdue_banner: "Une mise à jour de statut est en retard",
    post_update: "Publier la mise à jour",
    settings: {
      cadence: "Fréquence des mises à jour",
      cadence_biweekly: "Toutes les deux semaines",
      cadence_disabled: "Désactivée",
      cadence_monthly: "Mensuelle",
      cadence_weekly: "Hebdomadaire",
      owner: "Responsable des mises à jour",
      reminders_enabled: "Envoyer des rappels",
      title: "Mises à jour de statut",
    },
    since_last_update: "Depuis la dernière mise à jour",
    status: {
      at_risk: "À risque",
      off_track: "Hors piste",
      on_track: "Dans les temps",
    },
    summary: {
      cycles_closed: "{count} cycles clôturés",
      cycles_started: "{count} cycles démarrés",
      issues_cancelled: "{count} éléments de travail annulés",
      issues_completed: "{count} éléments de travail terminés",
      issues_created: "{count} éléments de travail créés",
      net_backlog_change: "Variation nette du backlog : {count}",
    },
    toast: {
      delete_success: "Mise à jour de statut supprimée avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      publish_success: "Mise à jour de statut publiée avec succès",
      update_success: "Mise à jour de statut enregistrée avec succès",
    },
  },
  wiki: {
    archived: "Archivé(e)",
    delete_folder: "Supprimer le dossier",
    delete_folder_modal: {
      description_empty: "Êtes-vous sûr de vouloir supprimer ce dossier ? Cette action est irréversible.",
      description_non_empty:
        "Ce dossier contient des pages ou des sous-dossiers. Choisissez ce qu’il doit en advenir, puis confirmez la suppression.",
      option_cascade: "Supprimer tout son contenu",
      option_cascade_description:
        "Ce dossier, ainsi que toutes les pages et sous-dossiers qu’il contient, seront supprimés.",
      option_promote: "Remonter son contenu d’un niveau",
      option_promote_description:
        "Les pages et sous-dossiers sont déplacés vers le dossier parent (ou la racine du Wiki).",
      title: "Supprimer le dossier",
    },
    empty_state: {
      all: {
        description: "Créez votre première page ou votre premier dossier Wiki pour commencer à documenter.",
        title: "Rien à afficher pour le moment",
      },
      archived: {
        description: "Les pages et dossiers Wiki archivés s’afficheront ici.",
        title: "Aucune page archivée",
      },
      private: {
        description: "Les pages Wiki privées dont vous êtes propriétaire s’afficheront ici.",
        title: "Aucune page privée",
      },
      public: {
        description: "Les pages Wiki publiques s’afficheront ici.",
        title: "Aucune page publique",
      },
    },
    folder_form: {
      create_title: "Nouveau dossier",
      name_placeholder: "Nom du dossier",
      rename_title: "Renommer le dossier",
    },
    label: "Wiki",
    move_to_project: "Déplacer vers un projet",
    move_to_project_description:
      "Choisissez le projet vers lequel déplacer cette page. Son historique de versions et ses sous-pages sont conservés.",
    move_to_wiki: "Déplacer vers le Wiki",
    new: "Nouveau",
    new_folder: "Nouveau dossier",
    new_page: "Nouvelle page",
    no_folder: "Aucun dossier",
    rename_folder: "Renommer le dossier",
    search_badge: "Wiki",
    settings: {
      description: "Contrôlez qui peut créer des dossiers et des pages à la racine du Wiki de l’espace de travail.",
      root_creation_role_admin: "Administrateurs uniquement",
      root_creation_role_label: "Qui peut créer du contenu à la racine du Wiki",
      root_creation_role_member: "Administrateurs et membres",
      title: "Wiki",
    },
    toast: {
      convert_error: "La page n’a pas pu être déplacée. Veuillez réessayer.",
      convert_to_project_success: "Page déplacée vers le projet.",
      convert_to_wiki_success: "Page déplacée vers le Wiki.",
      folder_create_success: "Dossier créé avec succès.",
      folder_delete_success: "Dossier supprimé avec succès.",
      folder_error: "Une erreur s’est produite. Veuillez réessayer.",
      folder_update_success: "Dossier mis à jour avec succès.",
      max_depth_error: "Les dossiers ne peuvent être imbriqués que sur 3 niveaux maximum.",
      page_move_error: "La page n’a pas pu être déplacée. Veuillez réessayer.",
      page_move_success: "Page déplacée avec succès.",
    },
    comments: {
      anchor_not_found: "Texte d'ancrage introuvable dans le document :",
      aria: {
        actions: "Actions du commentaire",
        scroll_to_text: "Faire défiler jusqu'au texte de ce commentaire dans le document",
      },
      errors: {
        delete_failed: "Impossible de supprimer le commentaire.",
        reply_failed: "Impossible de publier la réponse.",
        status_update_failed: "Impossible de mettre à jour le statut du fil.",
        update_failed: "Impossible de mettre à jour le commentaire.",
      },
      placeholder_edit: "Modifier le commentaire…",
      placeholder_reply: "Répondre…",
      reopen: "Rouvrir",
      reply: "Répondre",
      resolve: "Résoudre",
      scroll_to_text: "Faire défiler jusqu'au texte dans le document",
      time_ago: "il y a {time}",
    },
    delete_modal: {
      confirm_prefix: "Êtes-vous sûr de vouloir supprimer la page-",
      confirm_suffix: " ? La page sera supprimée définitivement. Cette action ne peut pas être annulée.",
      error: "La page n'a pas pu être supprimée. Veuillez réessayer.",
      success: "Page supprimée avec succès.",
      title: "Supprimer la page",
    },
    editor: {
      content_limit_banner: {
        dismiss_aria: "Ignorer l'avertissement de limite de contenu",
        message:
          "Limite de contenu atteinte et la synchronisation en direct est désactivée. Créez une nouvelle page ou utilisez des pages imbriquées pour continuer la synchronisation.",
      },
      title_placeholder: "Sans titre",
    },
    form: {
      create_button: "Créer une page",
      create_title: "Créer une page",
      max_length_error: "La longueur maximale du nom doit être inférieure à 255 caractères",
    },
    list: {
      search_placeholder: "Rechercher des pages",
    },
    move_to_project_modal: {
      move_button: "Déplacer",
      select_project_placeholder: "Sélectionner un projet",
    },
  },
  workspace_dashboards: {
    create_dashboard: "Nouveau tableau de bord",
    delete_confirmation: {
      description:
        "Voulez-vous vraiment supprimer ce tableau de bord ? Tous ses widgets seront également supprimés. Cette action est irréversible.",
      title: "Supprimer le tableau de bord",
    },
    description: "Description",
    description_placeholder: "Description du tableau de bord",
    editor: {
      add_widget: "Ajouter un widget",
      empty_state: {
        description: "Ajoutez un widget graphique, KPI ou tableau pour commencer.",
        title: "Ce tableau de bord est vide",
      },
      max_widgets_reached: "Un tableau de bord peut contenir 20 widgets au maximum",
      read_only_banner: "Vous n’avez pas la permission de modifier ce tableau de bord",
    },
    empty_state: {
      cta_primary: "Nouveau tableau de bord",
      description:
        "Créez un tableau de bord personnalisé à partir de widgets graphique, KPI et tableau, en regroupant les données de tous les projets de cet espace de travail.",
      title: "Aucun tableau de bord pour le moment",
    },
    label: "Tableaux de bord",
    name: "Nom",
    name_placeholder: "Nom du tableau de bord",
    page_label: "{workspace} - Tableaux de bord",
    public: {
      last_refreshed: "Dernière actualisation",
      not_published: "Ce tableau de bord n’est pas publié ou le lien a été désactivé.",
      rate_limited: "Trop de requêtes. Veuillez réessayer dans un instant.",
      read_only_banner: "Vue publique - lecture seule",
    },
    published_badge: "Publié",
    share: {
      copy_link: "Copier le lien",
      description:
        "Toute personne disposant du lien peut consulter une copie en lecture seule de ce tableau de bord. Aucune connexion requise.",
      link_copied: "Lien de la page publiée copié avec succès.",
      not_published: "Ce tableau de bord n’est pas publié",
      publish: "Publier",
      published_banner: "Ce tableau de bord est en ligne",
      publishing: "Publication en cours",
      regenerate_confirmation:
        "Régénérer le lien invalidera immédiatement l’ancien. Toute personne utilisant le lien précédent ne pourra plus accéder à ce tableau de bord.",
      regenerate_link: "Régénérer le lien",
      regenerating_link: "Régénération en cours",
      title: "Partager le tableau de bord",
      unpublish: "Dépublier",
      unpublishing: "Dépublication en cours",
    },
    toast: {
      create_success: "Tableau de bord créé avec succès",
      delete_success: "Tableau de bord supprimé avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      update_success: "Tableau de bord mis à jour avec succès",
    },
    update_dashboard: "Mettre à jour le tableau de bord",
    widget: {
      actions: {
        delete: "Supprimer le widget",
        delete_confirmation: "Voulez-vous vraiment supprimer ce widget ?",
        edit: "Modifier le widget",
      },
      chart: {
        fields: {
          assignees__id: "Assigné",
          completed_at: "Date d’achèvement",
          created_at: "Date de création",
          estimate_point__value: "Point d’estimation",
          issue_cycle__cycle_id: "Cycle",
          issue_module__module_id: "Module",
          labels__id: "Étiquette",
          priority: "Priorité",
          start_date: "Date de début",
          state__group: "Groupe d’état",
          state_id: "État",
          target_date: "Date d’échéance",
        },
        no_segment: "Aucun segment",
        segment: "Segment (facultatif)",
        x_axis: "Axe X",
        y_axis: "Axe Y",
        y_axis_fields: {
          estimate: "Estimation",
          issue_count: "Nombre d’éléments de travail",
        },
      },
      data: {
        empty: "Aucune donnée pour le moment",
        error: "Impossible de charger les données de ce widget.",
        loading: "Chargement...",
        rate_limited: "Trop de requêtes. Veuillez réessayer dans un instant.",
        refresh: "Actualiser",
        total: "Total",
      },
      kpi: {
        metric_label: "Métrique",
        metrics: {
          completion_rate: "Taux d’achèvement",
          overdue_issues: "Éléments de travail en retard",
          total_issues: "Total des éléments de travail",
          total_open_issues: "Total des éléments de travail ouverts",
        },
      },
      projects_label: "Projets",
      projects_placeholder: "Sélectionner des projets",
      table: {
        assignee_label: "Assignés",
        columns: {
          assignees: "Assignés",
          due_date: "Date d’échéance",
          labels: "Étiquettes",
          name: "Élément de travail",
          priority: "Priorité",
          project: "Projet",
          state: "État",
        },
        due_date_filters: {
          due_today: "Échéance aujourd’hui",
          no_due_date: "Aucune date d’échéance",
          overdue: "En retard",
        },
        due_date_label: "Date d’échéance",
        empty_state: "Aucun élément de travail ne correspond aux filtres de ce widget.",
        label_label: "Étiquettes",
        load_more: "Charger plus",
        priority_label: "Priorité",
        state_label: "États",
      },
      title_label: "Titre",
      title_placeholder: "Titre du widget",
      types: {
        chart: "Graphique",
        kpi: "KPI",
        table: "Tableau",
      },
      widget_type_label: "Type de widget",
    },
  },
  power_k: {
    account_actions: {
      sign_out: "Se déconnecter",
      workspace_invites: "Invitations à l’espace de travail",
    },
    contextual_actions: {
      cycle: {
        add_to_favorites: "Ajouter aux favoris",
        copy_url: "Copier l’URL",
        copy_url_toast_error: "Une erreur est survenue lors de la copie de l’URL du cycle dans le presse-papiers.",
        copy_url_toast_success: "URL du cycle copiée dans le presse-papiers.",
        indicator: "Cycle",
        remove_from_favorites: "Retirer des favoris",
        title: "Actions du cycle",
      },
      module: {
        add_remove_members: "Ajouter/retirer des membres",
        add_to_favorites: "Ajouter aux favoris",
        change_status: "Changer le statut",
        copy_url: "Copier l’URL",
        copy_url_toast_error: "Une erreur est survenue lors de la copie de l’URL du module dans le presse-papiers.",
        copy_url_toast_success: "URL du module copiée dans le presse-papiers.",
        indicator: "Module",
        remove_from_favorites: "Retirer des favoris",
        title: "Actions du module",
      },
      page: {
        add_to_favorites: "Ajouter aux favoris",
        archive: "Archiver",
        copy_url: "Copier l’URL",
        copy_url_toast_error: "Une erreur est survenue lors de la copie de l’URL de la page dans le presse-papiers.",
        copy_url_toast_success: "URL de la page copiée dans le presse-papiers.",
        indicator: "Page",
        lock: "Verrouiller",
        make_private: "Rendre privée",
        make_public: "Rendre publique",
        remove_from_favorites: "Retirer des favoris",
        restore: "Restaurer",
        title: "Actions de la page",
        unlock: "Déverrouiller",
      },
      work_item: {
        add_labels: "Ajouter des étiquettes",
        add_to_cycle: "Ajouter au cycle",
        add_to_modules: "Ajouter aux modules",
        assign_to_me: "M’assigner",
        change_assignees: "Assigner à",
        change_estimate: "Changer l’estimation",
        change_priority: "Changer la priorité",
        change_state: "Changer l’état",
        copy_id: "Copier l’ID",
        copy_id_toast_error:
          "Une erreur est survenue lors de la copie de l’ID de l’élément de travail dans le presse-papiers.",
        copy_id_toast_success: "ID de l’élément de travail copié dans le presse-papiers.",
        copy_title: "Copier le titre",
        copy_title_toast_error:
          "Une erreur est survenue lors de la copie du titre de l’élément de travail dans le presse-papiers.",
        copy_title_toast_success: "Titre de l’élément de travail copié dans le presse-papiers.",
        copy_url: "Copier l’URL",
        copy_url_toast_error:
          "Une erreur est survenue lors de la copie de l’URL de l’élément de travail dans le presse-papiers.",
        copy_url_toast_success: "URL de l’élément de travail copiée dans le presse-papiers.",
        delete: "Supprimer",
        indicator: "Élément de travail",
        subscribe: "S’abonner aux notifications",
        title: "Actions de l’élément de travail",
        unassign_from_me: "Me désassigner",
        unsubscribe: "Se désabonner des notifications",
      },
    },
    creation_actions: {
      create_cycle: "Nouveau cycle",
      create_initiative: "Nouvelle initiative",
      create_module: "Nouveau module",
      create_page: "Nouvelle page",
      create_project: "Nouveau projet",
      create_view: "Nouvelle vue",
      create_work_item: "Nouvel élément de travail",
      create_workspace: "Nouvel espace de travail",
    },
    footer: {
      workspace_level: "Niveau espace de travail",
    },
    general_actions: {
      open_ai_assistant: "Demander à l’assistant IA",
    },
    group_titles: {
      account: "Compte",
      contextual: "Contextuel",
      create: "Créer",
      general: "Général",
      help: "Aide",
      miscellaneous: "Divers",
      navigation: "Navigation",
      preferences: "Préférences",
      settings: "Paramètres",
    },
    help_actions: {
      join_forum: "Rejoindre notre forum",
      open_keyboard_shortcuts: "Ouvrir les raccourcis clavier",
      open_plane_documentation: "Ouvrir la documentation Plane",
      report_bug: "Signaler un bug",
    },
    miscellaneous_actions: {
      copy_current_page_url: "Copier l’URL de la page actuelle",
      copy_current_page_url_toast_error:
        "Une erreur est survenue lors de la copie de l’URL de la page actuelle dans le presse-papiers.",
      copy_current_page_url_toast_success: "URL de la page actuelle copiée dans le presse-papiers.",
      focus_top_nav_search: "Activer le champ de recherche",
      toggle_app_sidebar: "Afficher/masquer la barre latérale",
    },
    navigation_actions: {
      nav_account_settings: "Aller aux paramètres du compte",
      nav_all_workspace_work_items: "Aller à tous les éléments de travail",
      nav_assigned_workspace_work_items: "Aller aux éléments de travail assignés",
      nav_created_workspace_work_items: "Aller aux éléments de travail créés",
      nav_home: "Aller à l’accueil",
      nav_inbox: "Aller à la boîte de réception",
      nav_project_archives: "Aller aux archives du projet",
      nav_project_cycles: "Aller aux cycles",
      nav_project_intake: "Aller à l’intake",
      nav_project_modules: "Aller aux modules",
      nav_project_pages: "Aller aux pages",
      nav_project_settings: "Aller aux paramètres du projet",
      nav_project_views: "Aller aux vues du projet",
      nav_project_work_items: "Aller aux éléments de travail",
      nav_projects_list: "Aller à la liste des projets",
      nav_subscribed_workspace_work_items: "Aller aux éléments de travail suivis",
      nav_workspace_analytics: "Aller aux statistiques de l’espace de travail",
      nav_workspace_archives: "Aller aux archives de l’espace de travail",
      nav_workspace_drafts: "Aller aux brouillons de l’espace de travail",
      nav_workspace_settings: "Aller aux paramètres de l’espace de travail",
      nav_your_work: "Aller à votre travail",
      open_project: "Ouvrir un projet",
      open_project_cycle: "Ouvrir un cycle",
      open_project_module: "Ouvrir un module",
      open_project_setting: "Ouvrir un paramètre du projet",
      open_project_view: "Ouvrir une vue du projet",
      open_workspace: "Ouvrir un espace de travail",
      open_workspace_setting: "Ouvrir un paramètre de l’espace de travail",
    },
    page_placeholders: {
      default: "Saisissez une commande ou une recherche",
      open_project: "Ouvrir un projet",
      open_project_cycle: "Ouvrir un cycle",
      open_project_module: "Ouvrir un module",
      open_project_setting: "Ouvrir un paramètre du projet",
      open_project_view: "Ouvrir une vue du projet",
      open_workspace: "Ouvrir un espace de travail",
      open_workspace_setting: "Ouvrir un paramètre de l’espace de travail",
      update_language: "Changer la langue",
      update_module_member: "Changer les membres",
      update_module_status: "Changer le statut",
      update_start_of_week: "Changer le premier jour de la semaine",
      update_theme: "Changer le thème",
      update_timezone: "Changer le fuseau horaire",
      update_work_item_assignee: "Assigner à",
      update_work_item_cycle: "Ajouter au cycle",
      update_work_item_estimate: "Changer l’estimation",
      update_work_item_labels: "Ajouter des étiquettes",
      update_work_item_module: "Ajouter aux modules",
      update_work_item_priority: "Changer la priorité",
      update_work_item_state: "Changer l’état",
    },
    preferences_actions: {
      toast: {
        generic: {
          error: "Échec de la mise à jour des préférences. Veuillez réessayer.",
          success: "Préférences mises à jour avec succès.",
        },
        theme: {
          error: "Échec de la mise à jour du thème. Veuillez réessayer.",
          success: "Thème mis à jour avec succès.",
        },
        timezone: {
          error: "Échec de la mise à jour du fuseau horaire. Veuillez réessayer.",
          success: "Fuseau horaire mis à jour avec succès.",
        },
      },
      update_language: "Changer la langue de l’interface",
      update_start_of_week: "Changer le premier jour de la semaine",
      update_theme: "Changer le thème de l’interface",
      update_timezone: "Changer le fuseau horaire",
    },
    search_menu: {
      clear_search: "Effacer la recherche",
      no_results: "Aucun résultat trouvé",
    },
    search_placeholder: "Rechercher des commandes...",
    shortcuts_modal: {
      search_placeholder: "Rechercher des raccourcis",
    },
  },
  page_templates: {
    delete_confirm: {
      description:
        "Êtes-vous sûr de vouloir supprimer ce modèle de page ? Les pages déjà créées à partir de celui-ci ne seront pas affectées.",
      title: "Supprimer le modèle de page",
    },
    empty_state: {
      description:
        "Enregistrez une page existante bien structurée comme modèle pour la réutiliser dans vos projets et équipes.",
      title: "Aucun modèle de page pour l’instant",
    },
    label: "Modèles de page",
    name: "Nom du modèle",
    save_as_template: "Enregistrer comme modèle",
    save_modal: {
      description: "Donnez un nom à ce modèle afin que votre équipe puisse le retrouver et le réutiliser plus tard.",
      submit: "Enregistrer",
      title: "Enregistrer comme modèle",
    },
    settings: {
      description: "Des modèles réutilisables (titre, contenu, icône) pour vos nouvelles pages.",
      title: "Modèles de page",
    },
    start_from_scratch: "Page vierge",
    start_from_template: "Partir d’un modèle",
    toast: {
      delete_success: "Modèle de page supprimé avec succès",
      duplicate_success: "Modèle de page dupliqué avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      save_success: "Modèle de page enregistré avec succès",
    },
    usage_count: "Utilisé {count} fois",
    use_template: "Utiliser le modèle",
  },
  accordion_navigation_control: "Navigation latérale en accordéon",
  api_explorer: {
    label: "Explorateur d’API",
    settings: {
      description:
        "Parcourez le schéma OpenAPI réel de cette instance et exécutez de vrais appels sur les données de cet espace de travail, directement depuis le navigateur - aucun site de documentation externe requis.",
      title: "Explorateur d’API",
    },
    confirm_mutation: {
      title: "Cette action va modifier des données réelles",
      send_request: "Envoyer la requête",
      sending: "Envoi en cours...",
      warning_prefix: "Vous êtes sur le point d'envoyer une véritable requête",
      warning_suffix:
        "contre les données réelles de cet espace de travail. Cette action ne peut pas être annulée depuis ici.",
    },
    endpoint_browser: {
      search_placeholder: "Rechercher des points de terminaison...",
      no_matches: "Aucun point de terminaison ne correspond à votre recherche.",
    },
    history: {
      label: "Historique",
      no_calls: "Aucun appel effectué pour l'instant dans cette session.",
      replay: "Rejouer cet appel",
    },
    root: {
      errors: {
        load_settings_failed: "Impossible de charger les paramètres de l'explorateur d'API.",
        update_setting_failed: "Impossible de mettre à jour ce paramètre.",
        not_enabled: "L'explorateur d'API n'est pas activé sur cette instance (ou pour cet espace de travail).",
        token_rejected: "Ce jeton a été rejeté (invalide, expiré ou permissions insuffisantes).",
        schema_load_failed_status: "Impossible de charger le schéma (HTTP {status}).",
        schema_load_failed: "Impossible de charger le schéma.",
        replay_failed_title: "Impossible de rejouer",
        replay_failed_message: "Ce point de terminaison n'est plus présent dans le schéma actuel.",
        load_settings_failed_body:
          "Impossible de charger les paramètres de l'explorateur d'API pour cet espace de travail.",
      },
      live_data_warning_prefix: "Vous appelez la véritable API de l'espace de travail",
      live_data_warning_suffix: "Chaque requête ici affecte des données réelles.",
      settings_aria_label: "Paramètres de l'explorateur d'API",
      disabled_notice: "L'explorateur d'API est actuellement désactivé pour cet espace de travail.",
      disabled_notice_admin: "Activez-le ci-dessus pour continuer.",
      disabled_notice_member: "Demandez à un administrateur de l'espace de travail de l'activer.",
      select_endpoint_hint: "Sélectionnez un point de terminaison à gauche pour construire une requête.",
    },
    token_panel: {
      errors: {
        bootstrap_required:
          "Collez d'abord l'un de vos jetons API existants - il est nécessaire pour authentifier cette requête.",
        request_rejected: "Le serveur a rejeté cette requête (HTTP {status}).",
      },
      copied_message: "Jeton copié dans le presse-papiers.",
      active_token: "Jeton actif",
      ephemeral: "Éphémère",
      pasted: "Collé",
      expires_at: "Expire le {date} à {time}",
      change_token: "Changer de jeton",
      hide: "Masquer",
      reveal: "Révéler",
      copy: "Copier",
      setup_title: "Configurez un jeton pour commencer à explorer",
      setup_description:
        "Parcourir le schéma et exécuter de véritables appels nécessitent tous deux l'un de vos propres jetons API (Paramètres du profil > Jetons API). Collez-en un ci-dessous, puis utilisez-le directement ou échangez-le contre un jeton temporaire limité à cette session.",
      paste_placeholder: "Collez un jeton API existant",
      use_this_token: "Utiliser ce jeton",
      generate_temporary_token: "Générer un jeton temporaire",
      scope: "Portée",
      read_only: "Lecture seule",
      read_write: "Lecture et écriture",
      read_write_restricted_tooltip:
        "Seuls les administrateurs (ou les membres, si cet espace de travail l'autorise ci-dessous) peuvent demander un jeton en lecture-écriture.",
      lifetime: "Durée de vie (secondes, max 3600)",
      generate_token: "Générer le jeton",
    },
  },
  back_to_workspace: "Retour à l’espace de travail",
  customize_navigation: "Personnaliser la navigation",
  enter_number_of_projects: "Saisissez le nombre de projets",
  flexible_query: {
    label: "API de requêtes flexibles",
    settings: {
      description:
        "Un point d’accès de type GraphQL, authentifié par jeton, pour récupérer un graphe d’éléments de travail liés en une seule requête plutôt que d’enchaîner plusieurs appels REST.",
      title: "API de requêtes flexibles",
    },
    toast: {
      error: "Une erreur s’est produite. Veuillez réessayer.",
      quotas_updated_title: "Succès !",
      quotas_updated_message: "Quotas mis à jour.",
    },
    try_it: {
      missing_token: "Collez d’abord l’un de vos jetons API.",
      invalid_json: "Le corps de la requête doit être un JSON valide.",
      request_failed: "La requête n’a pas pu être envoyée.",
      title: "Essayer",
      description:
        "Collez l’un de vos propres jetons API (Paramètres de l’espace de travail > Jetons API) ainsi qu’un corps de requête pour envoyer une vraie requête à cet espace de travail - jamais un aperçu simulé.",
      token_placeholder: "Votre jeton API",
      run_query: "Exécuter la requête",
    },
    enable: {
      title: "Activer pour cet espace de travail",
      description:
        "Nécessite également que l’indicateur global de l’instance soit activé par la personne ayant déployé cette instance - ce commutateur ne couvre que l’adhésion propre à cet espace de travail.",
    },
    quotas: {
      title: "Quotas",
      max_depth: "Profondeur d’imbrication maximale",
      max_cost: "Coût maximal",
      timeout_ms: "Délai d’expiration (ms)",
    },
  },
  gantt: {
    dependency_lines: "Afficher les lignes de dépendance",
  },
  go_to_preferences: "Aller aux préférences",
  horizontal_navigation_bar: "Navigation par onglets",
  issue_duplicate_check: {
    banner_title: "Éléments de travail similaires détectés",
    dismiss_banner: "Ignorer",
  },
  issue_duplicate_suggestions: {
    action_error: "Une erreur s’est produite. Veuillez réessayer.",
    dismiss: "Ignorer",
    mark_duplicate: "Marquer comme doublon",
    mark_related: "Marquer comme lié",
    title: "Doublons suggérés",
  },
  language_and_time: "Langue et heure",
  language_setting: "Choisissez la langue utilisée dans l’interface utilisateur.",
  page_comments: "Commentaires sur les pages",
  page_comments_description: "Me notifier lorsque quelqu’un commente une page à laquelle je suis abonné.",
  page_edits: "Modifications de pages",
  page_edits_description:
    "Me notifier lorsqu’une page à laquelle je suis abonné est modifiée, renommée, verrouillée ou archivée.",
  page_mentions: "Mentions sur les pages",
  page_mentions_description:
    "Me notifier lorsque quelqu’un me mentionne dans le contenu ou les commentaires d’une page.",
  page_notifications_heading: "Pages",
  permission_bundles: {
    label: "Groupes de permissions",
    settings: {
      description:
        "Ensembles réutilisables et nommés de permissions atomiques - associez un ou plusieurs groupes à un rôle pour composer ses accès effectifs.",
      title: "Groupes de permissions",
    },
    panel: {
      description:
        "Ensembles nommes et reutilisables de permissions atomiques. Attachez un bundle a un ou plusieurs roles depuis l'onglet Roles (Parametres de l'espace de travail > Membres > Roles).",
      create_bundle: "Creer un bundle",
      toast: {
        deleted_title: "Bundle supprime",
        deleted_message: "« {name} » a ete supprime.",
        delete_failed_title: "Impossible de supprimer le bundle",
        delete_failed_attached_message: "{error} (attache a {count} role(s) - detachez-le d'abord).",
      },
      permission_count: "{count, plural, one{# permission} other{# permissions}}",
      empty: {
        title: "Aucun bundle pour le moment",
        description: "Creez votre premier bundle de permissions reutilisable.",
      },
    },
  },
  personal: "Personnel",
  pin: "Épingler",
  preferences: "Préférences",
  project_members: {
    display_name: "Nom d’affichage",
    email: "E-mail",
    full_name: "Nom complet",
    joining_date: "Date d’arrivée",
    role: "Rôle",
  },
  push_device_last_used: "Dernière utilisation",
  push_device_last_used_never: "Jamais utilisé",
  push_device_revoke: "Révoquer",
  push_device_revoke_confirm: "Voulez-vous vraiment déconnecter cet appareil ?",
  push_device_revoke_failed: "Impossible de déconnecter cet appareil",
  push_device_revoked_successfully: "Appareil déconnecté",
  push_devices_description: "Navigateurs actuellement abonnés aux notifications push sur votre compte.",
  push_devices_empty: "Aucun appareil connecté pour le moment.",
  push_devices_heading: "Appareils connectés",
  push_disable_failed: "Impossible de désactiver les notifications push",
  push_disabled_successfully: "Notifications push désactivées",
  push_enable_description:
    "Activer cette option demandera à votre navigateur l’autorisation d’envoyer des notifications.",
  push_enable_failed: "Impossible d’activer les notifications push",
  push_enable_label: "Activer les notifications push",
  push_enabled_successfully: "Notifications push activées pour ce navigateur",
  push_not_configured_description:
    "Les notifications push ne sont pas configurées sur cette instance. Contactez votre administrateur d’instance pour les activer depuis le Mode Dieu.",
  push_notifications_description: "Soyez notifié dans ce navigateur même lorsque Plane n’est pas ouvert.",
  push_notifications_heading: "Notifications push",
  push_permission_denied_message:
    "Les notifications sont bloquées pour Plane dans votre navigateur. Autorisez les notifications dans les paramètres de site de votre navigateur, puis réessayez.",
  push_quiet_hours_description:
    "Coupez les notifications push pendant une plage horaire quotidienne dans votre fuseau horaire. Les notifications dans l’application ne sont pas concernées.",
  push_quiet_hours_enabled_label: "Activer les heures de silence",
  push_quiet_hours_end_label: "Fin",
  push_quiet_hours_heading: "Heures de silence",
  push_quiet_hours_start_label: "Début",
  push_quiet_hours_timezone_label: "Fuseau horaire",
  push_quiet_hours_update_failed: "Échec de la mise à jour des heures de silence",
  push_quiet_hours_updated_successfully: "Heures de silence mises à jour avec succès",
  push_setting_update_failed: "Échec de la mise à jour du paramètre de notification push",
  push_setting_updated_successfully: "Paramètre de notification push mis à jour avec succès",
  push_unsupported_description: "Votre navigateur ne prend pas en charge les notifications push.",
  roadmap: {
    color_by: {
      health: "Santé",
      label: "Colorer par",
      priority: "Priorité",
    },
    empty_state: {
      description: "Les projets ayant une date de début ou une date cible apparaîtront ici sur la chronologie.",
      title: "Aucun projet à afficher",
    },
    label: "Feuille de route",
    settings: {
      description: "Visualisez la chronologie de chaque projet sur un diagramme de Gantt inter-projets unique.",
      title: "Feuille de route",
      toggle_label: "Activer la feuille de route",
    },
  },
  settings_description:
    "Gérez votre compte, votre espace de travail et vos préférences de projet en un seul endroit. Basculez entre les onglets pour configurer facilement.",
  settings_moved_to_preferences: "Les paramètres de fuseau horaire et de langue ont été déplacés vers les préférences.",
  show_limited_projects_on_sidebar: "Afficher un nombre limité de projets dans la barre latérale",
  timesheets: {
    label: "Feuilles de temps",
    settings: {
      description:
        "Exigez que les membres de l’équipe soumettent leur temps enregistré pour une période avant qu’il ne soit considéré comme définitif, et laissez le chef de projet ou un administrateur de l’espace de travail l’approuver ou le rejeter.",
      title: "Validation des feuilles de temps",
    },
  },
  timezone_setting: "Paramètre de fuseau horaire actuel.",
  unpin: "Désépingler",
  sla_policies: {
    delete_confirm: {
      description:
        "Êtes-vous sûr de vouloir supprimer cette politique SLA ? Les éléments de travail déjà suivis par celle-ci conservent leur historique de conformité.",
      title: "Supprimer la politique SLA",
    },
    empty_state: {
      description:
        "Créez une politique pour commencer à suivre les délais de réponse et de résolution sur les éléments de travail correspondants.",
      title: "Aucune politique SLA pour le moment",
    },
    fields: {
      assignees: "Assignés",
      critical_threshold: "Seuil critique",
      description: "Description",
      labels: "Étiquettes",
      name: "Nom",
      priority: "Priorité",
      resolution_time: "Délai de résolution",
      response_time: "Délai de réponse",
      state_group: "Groupe d’état",
      warning_threshold: "Seuil d’avertissement",
    },
    label: "Politiques SLA",
    report: {
      empty_state: "Aucune donnée SLA pour les filtres sélectionnés.",
      export_csv: "Exporter en CSV",
      title: "Rapport de conformité",
      truncated_notice:
        "Affichage des {shown} premiers résultats sur {total} - affinez vos filtres ou exportez en CSV pour obtenir l’ensemble complet.",
      all_assignees: "Tous les assignés",
      all_policies: "Toutes les politiques",
      clear_filters: "Effacer les filtres",
      column_breached_at: "Violé le",
      column_due_at: "Échéance le",
      column_issue: "Élément de travail",
      column_met_at: "Atteint le",
      column_status: "Statut",
      column_type: "Type",
      export_error: "Impossible d'exporter le rapport de conformité SLA.",
      from_date: "Date de début",
      policy: "Politique",
      to_date: "Date de fin",
      total: "Total",
    },
    scope: {
      all_projects: "Tous les projets",
      no_projects_warning:
        'Cette politique ne s’applique à aucun projet pour le moment - choisissez "Tous les projets" ou sélectionnez au moins un projet, sinon elle ne correspondra jamais à aucun élément de travail.',
      specific_projects: "Projets spécifiques",
    },
    settings: {
      description:
        "Délais de réponse et de résolution à l’échelle de l’espace de travail, appliqués par projet, priorité, étiquette, assigné ou groupe d’état.",
      title: "Politiques SLA",
    },
    sort_order_hint:
      "Un nombre plus petit signifie une priorité plus élevée. Lorsque plusieurs politiques correspondent à un élément de travail, celle avec le nombre le plus bas s’applique.",
    status: {
      achieved: "Atteint",
      at_risk: "À risque",
      breached: "Dépassé",
      cancelled: "Annulé",
      on_track: "Dans les temps",
      paused: "En pause",
    },
    toast: {
      delete_success: "Politique SLA supprimée avec succès",
      duplicate_success: "Politique SLA dupliquée avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      save_success: "Politique SLA enregistrée avec succès",
    },
    form: {
      any_assignee: "Tout assigné",
      any_label: "Toute étiquette",
      any_priority: "Toute priorité",
      any_state_group: "Tout groupe d'états",
      create_title: "Nouvelle politique de SLA",
      critical_threshold_percent: "Seuil critique (%)",
      description_placeholder: "Description (facultatif)",
      edit_title: "Modifier la politique de SLA",
      name_placeholder: "Nom de la politique",
      project_scope: "Portée du projet",
      resolution_time_placeholder: "ex. 4",
      response_time_placeholder: "ex. 30",
      save_error: "Impossible d'enregistrer la politique de SLA.",
      save_policy: "Enregistrer la politique",
      threshold_order_hint:
        "Le seuil critique doit être supérieur au seuil d'avertissement - les deux sont des pourcentages du budget de temps total écoulé avant l'échéance du SLA.",
      time_budget_hint: "Au moins l'un des délais de réponse ou de résolution doit être défini.",
      unit_days: "Jours",
      unit_hours: "Heures",
      unit_minutes: "Minutes",
      warning_threshold_percent: "Seuil d'avertissement (%)",
    },
    list_item: {
      delete_confirm_content:
        "Voulez-vous vraiment supprimer « {name} » ? Les éléments de travail déjà suivis dans le cadre de cette politique conservent leur historique de conformité.",
      delete_error: "Impossible de supprimer la politique.",
      duplicate_error: "Impossible de dupliquer la politique.",
      duplicate_success: "Politique de SLA dupliquée.",
      move_down: "Déplacer vers le bas",
      move_up: "Déplacer vers le haut",
      no_projects: "Aucun projet (ne correspond jamais)",
      project_count_one: "{count} projet",
      project_count_other: "{count} projets",
      update_error: "Impossible de mettre à jour la politique.",
    },
    property: {
      due_tooltip: "Échéance {date}, {time}",
      due_tooltip_with_policy: "{policy} - échéance {date}, {time}",
      label: "SLA",
    },
  },
  teamspaces: {
    create_teamspace: "Créer un espace d’équipe",
    cycles: {
      active: "Actif",
      completed: "Terminé",
      empty_state: {
        description: "Les cycles des projets rattachés à cet espace d’équipe s’afficheront ici.",
        title: "Aucun cycle pour l’instant",
      },
      upcoming: "À venir",
    },
    delete_confirm: {
      description: "Voulez-vous vraiment supprimer cet espace d’équipe ? Cette action est irréversible.",
      title: "Supprimer l’espace d’équipe",
      type_name_prompt: "Saisissez le nom de l’espace d’équipe pour continuer :",
    },
    description: "Description",
    empty_state: {
      description: "Créez un espace d’équipe pour regrouper membres et projets.",
      title: "Aucun espace d’équipe pour l’instant",
    },
    jump_into: {
      cycles: "Cycles",
      pages: "Pages",
      views: "Vues",
      work_items: "Éléments de travail",
    },
    label: "Espaces d’équipe",
    lead: "Responsable",
    members: "Membres",
    members_panel: {
      add_member: "Ajouter un membre",
      last_lead_error:
        "Un espace d’équipe doit toujours avoir au moins un responsable. Promouvez d’abord un autre membre.",
      lead: "Responsable",
      member: "Membre",
    },
    name: "Nom",
    overview: {
      blocked_by: "bloqué par",
      blocks: "bloque",
      empty_state: {
        description:
          "Cet espace d’équipe n’a pas encore de projets rattachés, ou vous n’avez accès à aucun de ses projets rattachés.",
        title: "Rien à afficher pour l’instant",
      },
      no_progress_data: "Aucun élément de travail à représenter pour l’instant.",
      no_relations: "Aucune relation trouvée pour cette direction.",
      no_stats_data: "Aucun élément de travail à ventiler pour l’instant.",
      overdue_work_items: "éléments de travail en retard",
      relations_blocked: "Bloqué",
      relations_blocking: "Bloquant",
      team_progress: "Avancement de l’équipe",
      team_relations: "Relations de l’équipe",
      team_stats: "Statistiques de l’équipe",
      work_items_count: "Éléments de travail",
    },
    pages: {
      create: "Créer une page",
      empty_state: "Aucune page d’espace d’équipe pour l’instant.",
      new_page_placeholder: "Nom de la nouvelle page",
      updated: "Mise à jour",
    },
    projects: "Projets",
    projects_tab: {
      add_projects: "Ajouter des projets",
      no_projects_available: "Tous vos projets sont déjà liés à cet espace d’équipe.",
      no_projects_linked: "Aucun projet lié à cet espace d’équipe pour l’instant",
    },
    tabs: {
      cycles: "Cycles",
      info: "Infos",
      members: "Membres",
      overview: "Aperçu",
      pages: "Pages",
      projects: "Projets",
      views: "Vues",
    },
    toast: {
      create_success: "Espace d’équipe créé avec succès",
      delete_success: "Espace d’équipe supprimé avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      update_success: "Espace d’équipe mis à jour avec succès",
    },
    update_teamspace: "Mettre à jour l’espace d’équipe",
    views: {
      create: "Créer une vue",
      empty_state: "Aucune vue d’espace d’équipe pour l’instant.",
      new_view_placeholder: "Nom de la nouvelle vue",
      updated: "Mise à jour",
    },
  },
  milestones: {
    add_issues: "Ajouter des éléments de travail",
    create_milestone: "Créer un jalon",
    delete_confirm: {
      description:
        "Êtes-vous sûr de vouloir supprimer ce jalon ? Les éléments de travail liés seront détachés, pas supprimés.",
      title: "Supprimer le jalon",
    },
    description: "Description",
    empty_state: {
      cta_primary: "Créer un jalon",
      description: "Découpez ce projet en étapes clés avec une date cible et un suivi automatique de la progression.",
      title: "Aucun jalon pour l’instant",
    },
    label: "Jalons",
    name: "Nom",
    no_issues_completed: "Aucun élément de travail lié",
    no_issues_linked: "Aucun élément de travail lié à ce jalon pour l’instant",
    no_milestone: "Aucun jalon",
    overdue: "En retard",
    target_date: "Date cible",
    toast: {
      create_success: "Jalon créé avec succès",
      delete_success: "Jalon supprimé avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      update_success: "Jalon mis à jour avec succès",
    },
    update_milestone: "Mettre à jour le jalon",
  },
  slack_integration: {
    connect_form: {
      bot_token_label: "Bot User OAuth Token",
      description:
        "Créez une application Slack sur api.slack.com/apps, installez-la sur votre espace de travail, puis collez ci-dessous son Bot User OAuth Token et son Signing Secret.",
      signing_secret_label: "Signing Secret",
      submit: "Connecter",
      title: "Se connecter via un jeton bot",
    },
    disconnect: "Déconnecter",
    disconnect_confirm: {
      description:
        "Cette action désactive la connexion ainsi que tous les mappings de canaux pour cet espace de travail. Les éléments de travail et commentaires déjà créés depuis Slack ne sont pas affectés.",
      title: "Déconnecter Slack",
    },
    label: "Slack",
    mappings: {
      add: "Ajouter un mapping",
      channel_id_label: "ID du canal Slack",
      channel_name_label: "Nom du canal (libellé facultatif)",
      description:
        "Associez un canal Slack à un projet pour y recevoir les notifications et permettre aux membres d’y créer des éléments de travail.",
      notify_on_label: "Notifier lors de",
      title: "Mappings de canaux",
    },
    oauth_button: "Se connecter avec Slack",
    settings: {
      description:
        "Connectez un espace de travail Slack pour permettre aux membres de l’équipe de créer des éléments de travail et d’y répondre sans quitter Slack.",
      title: "Slack",
    },
    status: {
      connected: "Connecté",
      not_connected: "Non connecté",
    },
    toast: {
      connect_error: "Impossible de se connecter à Slack.",
      connect_success: "Espace de travail Slack connecté avec succès.",
      disconnect_success: "Espace de travail Slack déconnecté.",
      mapping_add_success: "Mapping de canal ajouté.",
      mapping_remove_success: "Mapping de canal supprimé.",
    },
  },
  offline_sync: {
    banner: {
      offline:
        "Vous êtes hors ligne. Vos modifications seront enregistrées localement et synchronisées automatiquement dès que vous serez reconnecté.",
      reconnecting: "Connexion perdue. Nouvelle tentative...",
    },
    conflict: {
      panel_entry: "Écrasé par une modification plus récente sur le serveur : {field}",
      toast_description:
        'Votre modification hors ligne de "{field}" sur {entity} a été écrasée par une modification plus récente effectuée ailleurs.',
      toast_title: "Une modification a été écrasée",
    },
    indicator: {
      all_synced: "Toutes les modifications sont synchronisées",
      discard: "Ignorer",
      failed_reason: "Le serveur a rejeté cette modification : {reason}",
      has_failed: "Certaines modifications n’ont pas pu être synchronisées",
      offline: "Hors ligne",
      panel_empty: "Rien en attente - tout est synchronisé.",
      panel_title: "État de la synchronisation",
      retry: "Réessayer",
      retry_all_failed: "Réessayer tous les échecs",
      status_failed: "Échec",
      status_in_flight: "Synchronisation en cours",
      status_pending: "En attente",
      syncing: "{count, plural, one{Synchronisation (#)} other{Synchronisation (#)}}",
    },
    requires_connection: "Nécessite une connexion internet",
    settings: {
      description:
        "Permettez aux membres de continuer à créer et modifier des éléments de travail, des commentaires et des pages hors ligne - les modifications sont mises en file d’attente localement et synchronisées automatiquement dès le retour en ligne. Bêta : activez cette option progressivement et évitez-la sur les ordinateurs partagés ou publics.",
      title: "Mode hors ligne",
      toggle_label: "Activer le mode hors ligne (bêta)",
    },
    toast: {
      disabled: "Mode hors ligne désactivé pour cet espace de travail",
      enabled: "Mode hors ligne activé pour cet espace de travail",
      error: "Impossible de mettre à jour le paramètre du mode hors ligne",
    },
    unload_warning:
      "Certaines modifications ne sont pas encore synchronisées. Si vous quittez maintenant, vous risquez de les perdre.",
  },
  intake_channels: {
    delete_confirm: {
      description: "Les éléments de travail déjà créés via ce canal ne sont pas affectés.",
      title: "Supprimer le canal",
    },
    email: {
      add: "Ajouter un canal e-mail",
      copy_address: "Copier l’adresse",
      copy_success: "Adresse copiée dans le presse-papiers.",
      disabled_hint: "Désactivé - les e-mails entrants vers cette adresse sont rejetés.",
      regenerate: "Régénérer l’adresse",
      regenerate_confirm: {
        description:
          "L’ancienne adresse cesse de fonctionner immédiatement. Les éléments de travail déjà créés ne sont pas affectés.",
        title: "Régénérer l’adresse e-mail",
      },
    },
    empty_state: {
      description:
        "Ajoutez une adresse e-mail ou associez un canal Slack pour commencer à transformer des messages externes en éléments de travail.",
      title: "Aucun canal d’intake pour le moment",
    },
    label: "Canaux e-mail et Slack",
    settings: {
      description: "Transformez les e-mails et messages Slack entrants en éléments de travail dans ce projet.",
      title: "Canaux e-mail et Slack",
    },
    slack: {
      add: "Ajouter une association de canal Slack",
      no_connection:
        "Connectez d’abord un espace de travail Slack (Paramètres de l’espace de travail > Slack) pour associer un canal à ce projet.",
    },
  },
  ai: {
    assistant_settings: {
      description: "Contrôles supplémentaires pour l’assistant de chat IA intégré à l’application.",
      max_messages_per_hour: "Nombre maximal de messages par utilisateur et par heure",
      save_success: "Paramètres de l’assistant de chat enregistrés.",
      title: "Assistant de chat",
    },
    chat: {
      assistant_label: "Assistant",
      composer_placeholder_ask: "Posez une question à l’assistant IA sur ce contexte...",
      composer_placeholder_propose: "Décrivez la modification que vous souhaitez que l’assistant propose...",
      context_type: {
        cycle: "Chat du cycle",
        issue: "Chat de l’élément de travail",
        module: "Chat du module",
        page: "Chat de la page",
        project: "Chat du projet",
        workspace: "Chat de l’espace de travail",
      },
      create_error: "Impossible de démarrer une nouvelle conversation. Veuillez réessayer.",
      empty_thread: "Posez une question ou proposez une modification pour commencer.",
      generating: "Réflexion en cours...",
      generic_failure: "Une erreur s’est produite lors de la génération de cette réponse.",
      mode: {
        ask: "Demander",
        propose: "Proposer",
      },
      new_chat: "Nouveau chat",
      no_conversations: "Aucune conversation pour le moment.",
      propose_disabled_tooltip: "Vous devez au moins avoir un accès Membre ici pour utiliser le mode Proposer.",
      propose_forbidden: "Vous devez au moins avoir un accès Membre ici pour utiliser le mode Proposer.",
      rate_limited: "Vous envoyez trop de messages - réessayez dans quelques instants.",
      send_error: "Une erreur s’est produite. Veuillez réessayer.",
      title: "Assistant IA",
    },
    duplicate_detection_settings: {
      backfill_button: "Démarrer le traitement rétroactif",
      backfill_description:
        "Calculer les embeddings pour les éléments de travail créés avant l’activation de cette fonctionnalité.",
      backfill_label: "Traiter rétroactivement les éléments de travail existants",
      backfill_started: "Traitement rétroactif démarré.",
      description: "Contrôles supplémentaires pour la détection de doublons/similarités.",
      save_success: "Paramètres de détection de doublons enregistrés.",
      scope: {
        project: "Ce projet uniquement",
        workspace: "Tout l’espace de travail",
      },
      scope_label: "Portée de la recherche",
      threshold_label: "Seuil de similarité",
      title: "Détection de doublons",
    },
    features: {
      assistant: {
        description:
          "Permettez aux membres d’ouvrir un panneau de chat pour poser des questions ou proposer des modifications de champs (état, assignés, étiquettes...) sur les éléments de travail, cycles, modules et pages, avec validation avant toute application.",
        disabled_tooltip: "Configurez et activez d’abord un fournisseur IA ci-dessus.",
        label: "Assistant de chat IA intégré à l’application",
      },
      description:
        "Activez individuellement les fonctionnalités assistées par IA une fois qu’un fournisseur est configuré ci-dessus.",
      digest_llm_enrichment: {
        description:
          "Reformuler le résumé périodique de chaque membre en prose naturelle à l’aide du fournisseur configuré. Le résumé basé sur un modèle (regroupé par projet et type de modification) est toujours calculé en premier et utilisé comme solution de repli.",
        disabled_tooltip: "Configurez et activez d’abord un fournisseur IA ci-dessus.",
        label: "Reformulation des résumés par IA",
      },
      duplicate_detection: {
        description:
          "Avertir lors de la création d’un élément de travail si un élément très similaire existe déjà, et afficher les doublons suggérés sur les éléments de travail existants.",
        disabled_tooltip: "Configurez et activez d’abord un fournisseur IA ci-dessus.",
        label: "Détection de doublons/similarités",
      },
      thread_summary: {
        description:
          "Résumer le fil de commentaires d’un ticket avec des citations renvoyant aux commentaires d’origine.",
        disabled_tooltip: "Configurez et activez d’abord un fournisseur IA ci-dessus.",
        label: "Résumé IA du fil de discussion",
      },
      title: "Fonctionnalités",
      triage: {
        description:
          "Suggérer un module, des assignés et des étiquettes pour les éléments de travail nouvellement créés en fonction de leur similarité avec les tickets passés. Les paramètres par projet et les seuils de confiance se trouvent dans les paramètres propres à chaque projet.",
        disabled_tooltip: "Configurez et activez d’abord un fournisseur IA ci-dessus.",
        label: "Triage automatique assisté par IA",
      },
      update_draft: {
        description:
          "Rédiger une ébauche de statut de projet à partir de l’activité récente des tickets, à faire relire, modifier et publier par un responsable. Concerne uniquement les statuts de projet.",
        disabled_tooltip: "Configurez et activez d’abord un fournisseur IA ci-dessus.",
        label: "Rédaction de statuts assistée par IA",
      },
    },
    fields: {
      api_base_url: "URL de base de l’API",
      api_base_url_hint:
        "Utilisé uniquement pour le fournisseur personnalisé (compatible OpenAI), par exemple un point de terminaison auto-hébergé.",
      api_key: "Clé API",
      api_key_configured: "Une clé est déjà configurée pour cet espace de travail.",
      api_key_placeholder: "Saisissez une nouvelle clé API pour remplacer celle enregistrée",
      enabled: "Activé",
      model_name: "Nom du modèle",
    },
    label: "IA",
    proposals: {
      approve: "Approuver",
      approve_success: "Proposition approuvée et appliquée.",
      reject: "Rejeter",
      reject_success: "Proposition rejetée.",
      resolve_error: "Une erreur s’est produite. Veuillez réessayer.",
      status: {
        applied: "Appliquée",
        approved: "Approuvée",
        expired: "Expirée",
        pending: "En attente",
        rejected: "Rejetée",
      },
    },
    provider: {
      anthropic: "Anthropic",
      custom_openai_compatible: "Personnalisé (compatible OpenAI)",
      gemini: "Gemini",
      label: "Fournisseur",
      openai: "OpenAI",
    },
    settings: {
      description:
        "Connectez un fournisseur LLM propre à l’espace de travail et activez individuellement les fonctionnalités assistées par IA. Aucune donnée de l’espace de travail n’est jamais envoyée à un fournisseur tant qu’il n’a pas été explicitement configuré et activé ici.",
      title: "IA",
    },
    summary: {
      comment_deleted: "Commentaire supprimé",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      failed: "Impossible de générer le résumé, réessayez.",
      generate: "Générer un résumé IA",
      generating: "Génération du résumé en cours...",
      no_summary_yet: "Aucun résumé pour le moment.",
      not_configured_admin: "L’IA n’est pas encore configurée pour cet espace de travail.",
      not_configured_link: "Accédez à Paramètres > IA",
      not_enough_comments: "Ce ticket nécessite encore quelques commentaires avant qu’un résumé ne soit pertinent.",
      regenerate: "Régénérer",
      stale_badge: "Nouveaux commentaires depuis ce résumé",
      title: "Résumé IA",
    },
    test_connection: {
      error: "Échec de la connexion.",
      label: "Tester la connexion",
      success: "Connexion réussie.",
    },
    toast: {
      error: "Une erreur s’est produite. Veuillez réessayer.",
      save_success: "Configuration de l’IA enregistrée.",
    },
    triage: {
      accept: "Accepter",
      all_resolved: "Aucune suggestion en attente - tous les champs ont été résolus.",
      applied_badge_label: "IA",
      applied_badge_tooltip: "Cette valeur a été suggérée et appliquée par l’IA.",
      based_on_issues: "Basé sur ces tickets similaires",
      dismissed_trace: "Suggestion ignorée pour : {fields}",
      fields: {
        assignees: "Assignés",
        labels: "Étiquettes",
        module: "Module",
      },
      rate_limited: "Vous régénérez trop souvent - réessayez dans une minute.",
      regenerate: "Suggérer à nouveau",
      regenerate_error: "Impossible de mettre en file d’attente une nouvelle suggestion. Veuillez réessayer.",
      reject: "Rejeter",
      resolve_error: "Une erreur s’est produite. Veuillez réessayer.",
      similar_issues_unavailable: "Ces tickets ne sont plus disponibles.",
      terminal_state_tooltip:
        "Les suggestions ne peuvent pas être régénérées pour un élément de travail dans un état terminé ou annulé.",
      title: "Suggestions de l’IA",
      undo: "Annuler",
      undo_error: "Une erreur s’est produite. Veuillez réessayer.",
      why_suggestion: "Pourquoi cette suggestion ?",
    },
    update_draft_settings: {
      daily_generation_limit: "Limite quotidienne de génération (à l’échelle de l’espace de travail)",
      data_scope: {
        full_descriptions: "Titres, états, assignés et descriptions complètes",
        label: "Données envoyées au fournisseur LLM",
        titles_states_only: "Titres, états et assignés uniquement",
      },
      description: "Contrôles supplémentaires pour la rédaction de statuts assistée par IA.",
      max_regenerations: "Nombre maximal de régénérations par ébauche",
      save_success: "Paramètres de rédaction de statuts enregistrés.",
      title: "Rédaction de statuts",
    },
  },
  initiatives: {
    activity: "Activité",
    add_projects: "Ajouter des projets",
    create_initiative: "Créer une initiative",
    delete_confirm: {
      description: "Êtes-vous sûr de vouloir supprimer cette initiative ? Cette action est irréversible.",
      title: "Supprimer l’initiative",
    },
    description: "Description",
    health: {
      at_risk: "À risque",
      label: "Santé",
      no_status: "Aucun statut",
      off_track: "Hors piste",
      on_track: "Dans les temps",
    },
    label: "Initiatives",
    lead: "Responsable",
    name: "Nom",
    no_projects_linked: "Aucun projet n’est encore lié à cette initiative",
    projects: "Projets",
    settings: {
      description: "Activez des fonctionnalités optionnelles à l’échelle de l’espace de travail.",
      title: "Fonctionnalités",
      toggle_label: "Activer les initiatives",
    },
    start_date: "Date de début",
    status: "Statut",
    target_date: "Date cible",
    toast: {
      create_success: "Initiative créée avec succès",
      delete_success: "Initiative supprimée avec succès",
      error: "Une erreur s’est produite. Veuillez réessayer.",
      update_success: "Initiative mise à jour avec succès",
    },
    unlink_project_confirm: "Êtes-vous sûr de vouloir retirer ce projet de l’initiative ?",
    update_initiative: "Mettre à jour l’initiative",
  },
  workflow_rules: {
    action_config: {
      add_to_existing: "Ajouter à l'existant",
      replace_existing: "Remplacer l'existant",
      replace_existing_assignees: "Remplacer les assignés existants",
      add_to_existing_assignees: "Ajouter aux assignés existants",
      choose_labels: "Choisir des étiquettes",
      labels_selected_count: "{count, plural, one {# étiquette sélectionnée} other {# étiquettes sélectionnées}}",
      relative_to_trigger: "Relatif au déclencheur",
      fixed_date: "Date fixe",
      days_from_trigger: "jour(s) après le déclencheur",
      user_to_mention: "Utilisateur à mentionner",
    },
    root: {
      title: "Règles personnalisées",
      description:
        "Mettez à jour automatiquement les éléments de travail en fonction de déclencheurs, de conditions et d'actions.",
      new_rule: "Nouvelle règle",
      empty_state: "Aucune règle personnalisée configurée pour le moment.",
    },
    form: {
      name_required: "Le nom est requis.",
      save_error: "Impossible d'enregistrer la règle.",
      edit_rule: "Modifier la règle",
      new_rule: "Nouvelle règle",
      rule_name_placeholder: "Nom de la règle",
      description_placeholder: "Description (facultatif)",
      trigger: "Déclencheur",
      save_rule: "Enregistrer la règle",
    },
    list_item: {
      update_error: "Impossible de mettre à jour la règle.",
      duplicate_success: "Règle dupliquée.",
      duplicate_error: "Impossible de dupliquer la règle.",
      delete_error: "Impossible de supprimer la règle.",
      view_execution_history: "Voir l'historique d'exécution",
      summary: "{conditionCount} condition(s) - {actionCount} action(s) - déclenchée {executionCount} fois",
      last_run: "dernière exécution {time}",
      delete_title: "Supprimer la règle",
      delete_content: "Êtes-vous sûr de vouloir supprimer « {name} » ? Cette action est irréversible.",
    },
    trigger_config: {
      from_state: "État de départ",
      to_state: "État d'arrivée",
      any_state: "N'importe quel état",
    },
  },
  common_filters: {
    created_date: {
      title: "Date de création",
    },
    custom: "Personnalisé",
    no_matches_found: "Aucun résultat trouvé",
  },
  image_picker: {
    tabs: {
      unsplash: "Unsplash",
      images: "Images",
      upload: "Importer",
    },
    search_placeholder: "Rechercher des images",
    no_images_found: "Aucune image trouvée.",
    cover_image_alt: "Image de couverture {index}",
    drop_to_upload: "Déposez l'image ici pour l'importer",
    drag_and_drop: "Glissez-déposez une image ici",
    error_file_too_large: "La taille de l'image ne peut pas dépasser 5 Mo.",
    error_invalid_format: "Veuillez importer un fichier dans un format valide.",
    supported_formats: "Formats de fichier pris en charge : .jpeg, .jpg, .png, .webp",
    uploading: "Importation en cours",
    upload_and_save: "Importer et enregistrer",
    upload_error_title: "Image non importée",
    upload_error_message: "Impossible d'importer l'image",
  },
  bulk_delete_issues_modal: {
    select_at_least_one: "Veuillez sélectionner au moins un élément de travail.",
    deleted_success: "Éléments de travail supprimés avec succès !",
    select_to_delete: "Sélectionner les éléments de travail à supprimer",
    search_placeholder: "Rechercher...",
    deleting: "Suppression en cours...",
    delete_selected: "Supprimer les éléments de travail sélectionnés",
  },
  agents: {
    form: {
      errors: {
        display_name_required: "Le nom d'affichage est requis.",
        save_failed: "Impossible d'enregistrer l'agent.",
      },
      edit_title: "Modifier l'agent",
      create_title: "Nouvel agent",
      display_name_placeholder: "ex. Claude Code runner",
      agent_type: "Type d'agent",
      description_optional: "Description (facultatif)",
      description_placeholder: "Que fait cet agent ?",
      role_notice:
        "Les agents sont toujours créés en tant que membres de l'espace de travail et ne peuvent jamais obtenir le rôle d'administrateur ou la propriété de l'espace de travail.",
      create_agent: "Créer un agent",
    },
    list: {
      errors: {
        status_update_failed: "Impossible de mettre à jour le statut de cet agent.",
      },
      project_singular: "projet",
      project_plural: "projets",
      last_seen: "Vu pour la dernière fois",
      never: "Jamais",
      owner: "Propriétaire",
      manage_tokens: "Gérer les jetons",
      re_enable: "Réactiver",
      disable: "Désactiver",
      disable_modal: {
        title: "Désactiver l'agent",
        content:
          "Voulez-vous vraiment désactiver « {name} » ? Cela révoque immédiatement tous les jetons actifs de cet agent. Ses commentaires et son historique d'activité passés sont conservés.",
      },
    },
    tokens: {
      errors: {
        issue_failed: "Impossible d'émettre un jeton pour cet agent.",
        revoke_failed: "Impossible de révoquer ce jeton.",
      },
      title: "Jetons - {name}",
      description:
        "Configurez l'un de ces jetons dans votre exécuteur d'agent pour vous authentifier en tant que cet agent. Désactiver l'agent révoque immédiatement tous les jetons actifs.",
      issue_new_token: "Émettre un nouveau jeton",
      disabled_notice:
        "Cet agent est désactivé - il ne peut plus se voir émettre de nouveaux jetons, et tous ses jetons précédents ont déjà été révoqués.",
      no_tokens: "Aucun jeton n'a encore été émis pour cet agent.",
      revoked: "Révoqué",
      created: "Créé",
      last_used: "Dernière utilisation",
      never_used: "Jamais utilisé",
      revoke: "Révoquer",
      revoke_modal: {
        title: "Révoquer le jeton",
        content:
          "Voulez-vous vraiment révoquer « {label} » ? Cette action est immédiate et irréversible - l'exécuteur d'agent qui l'utilise ne pourra plus s'authentifier.",
      },
    },
  },
  automation: {
    select_month_modal: {
      errors: {
        range: "Sélectionnez un mois entre 1 et 12.",
      },
      enter_months: "Entrer le nombre de mois",
      months: "Mois",
      submitting: "Envoi en cours...",
    },
  },
  governed_workflows: {
    actions: {
      heading: "Actions (exécutées dans l’ordre après une transition autorisée)",
      empty_state: "Aucune action configurée.",
      choose_member: "Choisir un membre",
      no_config_needed: "Aucune configuration supplémentaire requise.",
      add_action: "Ajouter une action",
      max_reached: "Nombre maximal de {max} actions atteint.",
    },
    approvers: {
      heading: "Approbateurs",
      empty_state:
        "Aucune restriction - tout membre du projet atteignant cette transition peut l’exécuter directement.",
      specific_member: "Membre spécifique",
      choose_member: "Choisir un membre",
      choose_role: "Choisir un rôle",
      needs_approval: "Nécessite une approbation",
      add_approver: "Ajouter un approbateur",
    },
    transition_list_item: {
      toast: {
        error: "Erreur !",
        update_error: "Impossible de mettre à jour la transition.",
        delete_error: "Impossible de supprimer la transition.",
      },
      from_creation: "Depuis la création",
      unknown_state: "État inconnu",
      approver_count: "{count} approbateur(s) - ",
      no_approver_restriction: "Aucune restriction d’approbateur - ",
      condition_action_count: "{conditions} condition(s) - {actions} action(s)",
      delete_modal: {
        title: "Supprimer la transition",
        content: "Êtes-vous sûr de vouloir supprimer cette transition de workflow ? Cette action est irréversible.",
      },
      freeze_modal: {
        title: "Cela bloquera toutes les transitions pour ce type d’élément",
      },
    },
  },
  project_empty_state: {
    intake_sidebar_closed: {
      title: "Aucune demande clôturée pour le moment",
      description: "Tous les éléments de travail, qu'ils soient acceptés ou refusés, se trouvent ici.",
    },
  },
  intake_settings: {
    forms: {
      form_modal: {
        name_required: "Le nom du formulaire est requis.",
        save_error: "Impossible d'enregistrer le formulaire.",
        title_edit: "Modifier le formulaire",
        title_new: "Nouveau formulaire web",
        name_placeholder: "Nom interne du formulaire",
        description_placeholder: "Description affichée publiquement (HTML simple)",
        show_priority_field: "Afficher le champ priorité",
        show_labels_field: "Afficher le champ labels",
        require_submitter_name: "Nom du soumetteur requis",
        require_submitter_email: "Email du soumetteur requis",
        default_state: "État par défaut",
        default_labels: "Labels par défaut",
        label_count: "{count} label(s)",
        success_message_placeholder: "Message de succès",
        redirect_url_placeholder: "URL de redirection après soumission (optionnel)",
        rate_limit_label: "Limite par IP :",
        rate_limit_unit: "soumissions / heure",
      },
      list: {
        title: "Formulaires web",
        description:
          "Permet à des visiteurs externes anonymes de soumettre des demandes directement dans la file Intake.",
        new_form: "Nouveau formulaire",
        no_forms: "Aucun formulaire web configuré.",
        link_copied: "Lien copié dans le presse-papier.",
        update_error: "Impossible de mettre à jour le formulaire.",
        token_regenerated: "Le lien précédent est désormais invalide.",
        regenerate_error: "Impossible de régénérer le jeton.",
        delete_error: "Impossible de supprimer le formulaire.",
        copy_link: "Copier le lien",
        regenerate_link: "Régénérer le lien",
      },
    },
    responsibility: {
      save_error: "Impossible d'enregistrer les paramètres de responsabilité d'intake. Veuillez réessayer.",
      add_member_error: "Impossible d'ajouter le membre.",
      remove_member_error: "Impossible de retirer le membre.",
      reorder_error: "Impossible de réorganiser la rotation.",
      heading: {
        title: "Responsabilité d'intake",
        description: "Assigne automatiquement chaque nouvel item d'intake à un responsable.",
      },
      enable: {
        title: "Activer la responsabilité d'intake",
        description: "Un responsable sera calculé et notifié dès la création de chaque item d'intake.",
      },
      assignment_mode: {
        title: "Mode d'assignation",
        description: "Owner fixe (une seule personne) ou rotation round-robin entre plusieurs membres.",
        fixed_owner: "Owner fixe",
        round_robin: "Rotation round-robin",
      },
      fixed_owner: {
        description: "Le membre auquel tout nouvel item d'intake sera assigné.",
      },
      choose_member: "Choisir un membre",
      rotation: {
        members_heading: "Membres de la rotation",
        members_description: "Ordre d'assignation - le pointeur de rotation avance à chaque nouvel item.",
        no_members: "Aucun membre dans la rotation pour le moment.",
      },
      escalation: {
        title: "Délai d'escalade",
        description:
          "Minutes avant qu'un item Pending non traité soit réassigné au membre suivant (5-1440, rotation uniquement).",
      },
    },
    triage_rules: {
      update_error: "Impossible de mettre à jour la règle.",
      delete_error: "Impossible de supprimer la règle.",
      reorder_error: "Impossible de réorganiser les règles.",
      dry_run_error: "Impossible de tester la règle.",
      reapply_success: "{count} item(s) mis à jour.",
      reapply_error: "Impossible de réappliquer les règles.",
      list: {
        title: "Règles de triage",
        description: "Applique automatiquement priorité/labels/assignés/état aux items d'intake entrants.",
        reapply_button: "Réappliquer sur la file",
        new_rule: "Nouvelle règle",
        no_rules: "Aucune règle de triage configurée.",
        invalid_rule: "Règle invalide - action à corriger",
        test_button: "Tester",
        condition_count: "{count} condition(s)",
        no_actions: "aucune action",
        dry_run_matches: "{count} item(s) en attente correspondent actuellement :",
      },
      form_modal: {
        name_required: "Le nom de la règle est requis.",
        condition_required: "Au moins une condition est requise.",
        save_error: "Impossible d'enregistrer la règle.",
        title_edit: "Modifier la règle",
        name_placeholder: "Nom de la règle",
        active: "Active",
        conditions_heading: "SI (toutes les conditions doivent correspondre)",
        field_title: "Titre",
        operator_contains: "contient",
        operator_not_contains: "ne contient pas",
        operator_starts_with: "commence par",
        operator_regex: "regex",
        value_placeholder: "Valeur",
        add_condition: "Ajouter une condition",
        actions_heading: "ALORS",
        action_set_priority: "Définir la priorité",
        action_set_labels: "Ajouter des labels",
        action_set_assignees: "Assigner des membres",
        action_set_state: "Définir l'état",
        choose_labels: "Choisir des labels",
        choose_members: "Choisir des membres",
        add_action: "Ajouter une action",
      },
    },
  },
  issue_view: {
    empty_state: {
      project_view: {
        title: "Les éléments de travail de cette vue apparaîtront ici",
        description:
          "Les éléments de travail vous aident à suivre chaque tâche individuellement. Ils permettent de savoir ce qui se passe, qui y travaille et ce qui est terminé.",
      },
    },
    filters: {
      sub_group_by: {
        title: "Sous-grouper par",
      },
      date: {
        custom: "Personnalisé",
      },
    },
    all_issue_layout_root: {
      view_not_found: {
        title: "La vue n'existe pas",
        description: "La vue que vous recherchez n'existe pas ou vous n'avez pas la permission de la consulter.",
        cta: "Aller à Tous les éléments de travail",
      },
      save_as: "Enregistrer sous",
    },
  },
  navigation: {
    tab_overflow_menu: {
      show: "Afficher",
      clear_default: "Effacer la valeur par défaut",
      set_as_default: "Définir par défaut",
    },
  },
  onboarding: {
    profile_setup: {
      toasts: {
        success: "Configuration du profil terminée !",
        error: "Échec de la configuration du profil. Veuillez réessayer !",
        user_details_error: "Échec de la mise à jour des informations utilisateur. Veuillez réessayer !",
      },
      choose_image: "Choisir une image",
      errors: {
        first_name_required: "Le prénom est requis",
        first_name_max_length: "Le prénom ne doit pas dépasser 50 caractères.",
        last_name_required: "Le nom de famille est requis",
        last_name_max_length: "Le nom de famille ne doit pas dépasser 50 caractères.",
        passwords_dont_match: "Les mots de passe ne correspondent pas",
        select_at_least_one: "Veuillez sélectionner au moins une option",
        name_max_length: "Le nom ne doit pas dépasser 50 caractères.",
        passwords_do_not_match: "Les mots de passe ne correspondent pas",
      },
      set_a_password: "Définir un mot de passe",
      new_password_placeholder: "Nouveau mot de passe...",
      role_question: "Quel est votre rôle ? Choisissez-en un.",
      domain_question: "Quel est votre domaine d'expertise ? Choisissez-en un ou plusieurs.",
      roles: {
        individual_contributor: "Contributeur individuel",
        senior_leader: "Cadre supérieur",
        manager: "Manager",
        executive: "Dirigeant",
        freelancer: "Freelance",
        student: "Étudiant",
      },
      domains: {
        engineering: "Ingénierie",
        product: "Produit",
        marketing: "Marketing",
        sales: "Ventes",
        operations: "Opérations",
        legal: "Juridique",
        finance: "Finance",
        human_resources: "Ressources humaines",
        project: "Projet",
        other: "Autre",
      },
      header: {
        title: "Créez votre profil.",
        description: "Voici comment vous apparaîtrez dans Plane.",
      },
      change_image: "Changer l'image",
      upload_image: "Téléverser une image",
      full_name_placeholder: "Entrez votre nom complet",
      passwords_match: "Les mots de passe correspondent",
    },
    role_setup: {
      header: {
        title: "Quel est votre rôle ?",
        description: "Configurons Plane selon votre façon de travailler.",
      },
      select_one: "Sélectionnez-en un",
      roles: {
        product_manager: "Chef de produit",
        engineering_manager: "Responsable ingénierie",
        designer: "Designer",
        developer: "Développeur",
        founder_executive: "Fondateur/Dirigeant",
        operations_manager: "Responsable des opérations",
        others: "Autres",
      },
    },
    common: {
      skip: "Passer",
      tagline: "Tout votre travail, unifié.",
    },
    invite_team: {
      errors: {
        invalid_email: "Adresse e-mail invalide",
        not_an_email: "Cela ne ressemble pas à une adresse e-mail.",
      },
      header: {
        title: "Invitez vos coéquipiers",
        description:
          "Le travail dans Plane est plus efficace en équipe. Invitez-les dès maintenant pour exploiter tout le potentiel de Plane.",
      },
      add_another: "Ajouter un autre",
      do_it_later: "Je le ferai plus tard",
    },
    usecase_setup: {
      use_cases: {
        plan_and_track_product_roadmaps: "Planifier et suivre les feuilles de route produit",
        manage_engineering_sprints: "Gérer les sprints d'ingénierie",
        coordinate_cross_functional_projects: "Coordonner des projets transverses",
        replace_our_current_tool: "Remplacer notre outil actuel",
        just_exploring: "Simple découverte",
      },
      header: {
        title: "Qu'est-ce qui vous amène à Plane ?",
        description: "Parlez-nous de vos objectifs et de la taille de votre équipe.",
      },
      select_one_or_more: "Sélectionnez-en un ou plusieurs",
    },
    join_invites: {
      header: {
        title: "Rejoindre des invitations ou créer un espace de travail",
      },
      create_new_workspace: "Créer un nouvel espace de travail",
      no_invitations_found: "Aucune invitation trouvée",
    },
  },
  project: {
    delete_modal: {
      confirm_phrase: "supprimer mon projet",
      confirm_phrase_placeholder: "Saisissez « {phrase} »",
      confirm_phrase_prefix: "Pour confirmer, saisissez",
      confirm_phrase_suffix: "ci-dessous :",
      confirm_prefix: "Êtes-vous sûr de vouloir supprimer le projet",
      confirm_suffix:
        "Toutes les données liées au projet seront supprimées définitivement. Cette action ne peut pas être annulée",
      enter_name_prefix: "Saisissez le nom du projet",
      enter_name_suffix: "pour continuer :",
      error: "Une erreur s'est produite. Veuillez réessayer plus tard.",
      success: "Projet supprimé avec succès.",
    },
    filters: {
      created_at: {
        title: "Date de création",
      },
      custom: "Personnalisé",
    },
    leave_project_modal: {
      title: "Quitter le projet",
      leaving: "Quitte en cours...",
      description_prefix: "Êtes-vous sûr de vouloir quitter le projet -",
      description_suffix: "? Tous les éléments de travail qui vous sont associés deviendront inaccessibles.",
      enter_project_name_prefix: "Entrez le nom du projet",
      enter_project_name_suffix: "pour continuer :",
      project_name_placeholder: "Entrez le nom du projet",
      confirm_prefix: "Pour confirmer, tapez",
      confirm_phrase: "Quitter le projet",
      confirm_suffix: "ci-dessous :",
      confirm_placeholder: "Entrez « quitter le projet »",
      toast: {
        error_title: "Erreur !",
        generic_error: "Une erreur s'est produite, veuillez réessayer plus tard.",
        confirm_text_error: "Veuillez confirmer que vous quittez le projet en tapant « Quitter le projet ».",
        project_name_error: "Veuillez saisir le nom du projet tel qu'indiqué dans la description.",
        fill_all_fields_error: "Veuillez remplir tous les champs.",
      },
    },
    multi_select_modal: {
      search_placeholder: "Rechercher des projets",
    },
    settings: {
      member_defaults: {
        project_lead_description: "Sélectionnez le chef de projet pour ce projet.",
        default_assignee_description: "Sélectionnez l'acteur par défaut pour ce projet.",
        guest_access_title: "Accès invité",
      },
    },
    owner_section: {
      title: "Propriétaire du projet",
      tooltip:
        "Un propriétaire de projet peut supprimer ou archiver ce projet, gérer ses intégrations/webhooks et gérer les membres jusqu'au rôle d'administrateur de projet, sans avoir besoin d'un administrateur d'espace de travail.",
      permission_hint:
        "Seul le propriétaire de l'espace de travail ou un administrateur de l'espace de travail peut attribuer ou révoquer le propriétaire du projet.",
      current_owner_label: "Propriétaire actuel du projet",
      no_owner_placeholder: "Aucun propriétaire de projet attribué",
      no_eligible_admin:
        "Aucun administrateur de projet n'est encore éligible - promouvez d'abord un membre au rôle d'administrateur.",
      revoke_button: "Révoquer le propriétaire du projet",
      toast: {
        success_title: "Succès !",
        error_title: "Erreur !",
        assign_success: "Propriétaire du projet attribué.",
        assign_error: "Une erreur s'est produite lors de l'attribution du propriétaire du projet.",
        revoke_success: "Propriétaire du projet révoqué.",
        revoke_error: "Une erreur s'est produite lors de la révocation du propriétaire du projet.",
      },
    },
  },
  project_states: {
    delete: {
      confirm_prefix: "Êtes-vous sûr de vouloir supprimer l'état-",
      confirm_suffix:
        " ? Toutes les données liées à l'état seront supprimées définitivement. Cette action ne peut pas être annulée.",
      title: "Supprimer l'état",
      toast: {
        error_generic: "L'état n'a pas pu être supprimé. Veuillez réessayer.",
        error_in_use:
          "Cet état contient des éléments de travail. Veuillez les déplacer vers un autre état pour pouvoir supprimer celui-ci.",
      },
      tooltip: {
        default_state: "Impossible de supprimer l'état par défaut.",
        empty_group: "Un groupe ne peut pas être vide.",
      },
    },
  },
  recurring_issue_templates: {
    root: {
      title: "Éléments de travail récurrents",
      description: "Modèles qui créent automatiquement des éléments de travail selon un calendrier répétitif.",
      new_template: "Nouveau modèle",
      empty_state: "Aucun modèle récurrent configuré pour le moment.",
      previous: "Précédent",
    },
    form_modal: {
      edit_title: "Modifier le modèle récurrent",
      new_title: "Nouveau modèle récurrent",
      name_placeholder: "Nom du modèle",
      date_token_hint_prefix: "Utilisez le",
      date_token_hint_suffix: "jeton pour inclure la date de l'occurrence, par exemple « Standup hebdomadaire —",
      description_placeholder: "Description (facultatif)",
      recurrence: "Récurrence",
      repeats: "Se répète",
      select_frequency: "Sélectionnez la fréquence",
      every: "tous les",
      interval_unit: {
        daily: "jour(s)",
        weekly: "semaine(s)",
        monthly: "mois",
        yearly: "année(s)",
      },
      weekday_hint:
        "Si aucun jour n'est sélectionné, les occurrences se répètent le même jour de la semaine que la date de début.",
      on_day: "Le jour",
      of_the_month: "du mois",
      select_month: "Sélectionnez le mois",
      day_of_month_hint:
        "Les jours 29 à 31 ne sont pas disponibles chaque mois - si le jour choisi n'existe pas pour un mois donné, l'occurrence est générée le dernier jour de ce mois à la place.",
      end_date_optional: "Date de fin (facultatif)",
      no_end_date: "Aucune date de fin",
      max_occurrences_optional: "Nombre maximal d'occurrences (facultatif)",
      activation_tooltip: "Définissez une fréquence et une date de début avant d'activer ce modèle.",
      active: "Actif",
      errors: {
        name_required: "Le nom est requis.",
        activation_requirements: "Une fréquence et une date de début sont nécessaires pour activer ce modèle.",
        toast_title: "Erreur !",
        save_failed: "Impossible d'enregistrer le modèle récurrent.",
      },
    },
    list_item: {
      draft: "Brouillon",
      configure: "Configurer",
      pause: "Suspendre",
      resume: "Reprendre",
      view_generated: "Voir les éléments de travail générés",
      generate_now: "Générer maintenant",
      next_run: "Prochaine exécution {time_ago}",
      next_run_pending: "Prochaine exécution en attente",
      paused: "Suspendu",
      occurrences_generated: "{count} générées",
      delete_modal: {
        title: "Supprimer le modèle récurrent",
        content:
          "Êtes-vous sûr de vouloir supprimer « {name} » ? Les éléments de travail déjà générés à partir de ce modèle ne seront pas affectés. Cette action est irréversible.",
      },
      errors: {
        toast_title: "Erreur !",
        update_failed: "Impossible de mettre à jour le modèle.",
        generate_failed: "Impossible de générer un élément de travail à partir de ce modèle.",
        delete_failed: "Impossible de supprimer le modèle.",
      },
      success: {
        toast_title: "Succès !",
        generated_message: "« {name} » a été créé à partir de ce modèle.",
      },
    },
  },
  rich_filters: {
    advanced: {
      group: {
        empty_group: "Groupe vide - ajoutez une condition ou supprimez-le",
        condition: "Condition",
        group: "Groupe",
        max_conditions_reached: "Nombre maximal de {max} conditions atteint",
        max_depth_reached: "Profondeur d'imbrication maximale de {max} atteinte",
        remove_group_aria: "Supprimer le groupe",
      },
      move_actions: {
        move_up_aria: "Déplacer vers le haut",
        move_down_aria: "Déplacer vers le bas",
      },
    },
    filter_item: {
      remove_filter_aria: "Supprimer le filtre",
      invalid: {
        tooltip:
          "Cette condition de filtre n'est plus valide. La propriété a peut-être été supprimée ou votre accès à celle-ci a peut-être changé.",
        label: "Filtre invalide",
      },
    },
  },
  rbac: {
    bundle_editor: {
      category_workspace: "Workspace (anti-verrouillage uniquement - voir ci-dessous)",
      create_title: "Créer un ensemble",
      created_title: "Ensemble créé",
      description_placeholder: "Facultatif",
      edit_title: "Modifier l'ensemble",
      name_placeholder: "ex. Gestion des cycles",
      read_only_notice:
        "Les ensembles système reproduisent le comportement des rôles intégrés de ce fork et ne peuvent pas être modifiés ni supprimés - ils sont affichés ici en lecture seule à titre de référence. Créez un nouvel ensemble pour composer votre propre jeu d'autorisations.",
      save_error_title: "Impossible d'enregistrer l'ensemble",
      saved_message: "« {name} » a été enregistré.",
      updated_title: "Ensemble mis à jour",
    },
    condition: {
      creator_only: "Créateur uniquement",
      none: "Aucune condition",
      project_lead_only: "Responsable de projet uniquement",
    },
    create_role: {
      behaves_like_description:
        "Seules les autorisations Éléments de travail/Cycles/Modules/Pages/Vues sont pilotées par les ensembles que vous attachez ci-dessous. Tous les autres domaines de Plane (facturation, intégrations, exports...) vérifient toujours directement le niveau de ce membre - choisissez la correspondance la plus proche.",
      behaves_like_label: "Se comporte comme (pour les paramètres que ce générateur ne couvre pas encore)",
      description: "Un rôle démarre sans ensemble attaché - ajoutez-les depuis l'éditeur une fois qu'il est créé.",
      description_placeholder: "Facultatif",
      error_title: "Impossible de créer le rôle",
      name_placeholder: "ex. Responsable de projet junior",
      title: "Créer un rôle",
    },
    delete_role: {
      confirm_button: "Supprimer le rôle",
      confirm_content_empty: "Aucun membre ne détient actuellement « {name} » - cette action est irréversible.",
      confirm_title: "Supprimer ce rôle ?",
      delete_error_title: "Impossible de supprimer le rôle",
      deleted_message: "« {name} » a été supprimé.",
      deleted_title: "Rôle supprimé",
      reassign_and_delete_button: "Réaffecter {count} membre(s) et supprimer",
      reassign_description:
        "{count} membre(s) détiennent actuellement « {name} ». Choisissez un rôle vers lequel les déplacer tous avant que ce rôle puisse être supprimé - il n'y a pas de suppression silencieuse.",
      reassign_error_title: "Impossible de réaffecter et de supprimer",
      reassign_title: "Réaffecter les membres avant la suppression",
      reassign_to_label: "Réaffecter à",
      reassigned_and_deleted_message: "{count} membre(s) ont été réaffectés et « {name} » a été supprimé.",
      select_a_role: "Sélectionner un rôle",
    },
    legacy_tier: {
      admin: "Administrateur",
      guest: "Invité",
      member: "Membre",
    },
  },
  workspace_roles: {
    editor: {
      title: "Modifier le role",
      toast: {
        updated_title: "Role mis a jour",
        updated_message: "« {name} » a ete enregistre.",
        save_failed_title: "Impossible d'enregistrer le role",
        update_bundles_failed_title: "Impossible de mettre a jour les bundles",
        would_leave_unprotected: " (laisserait {permissions} non protege(s))",
      },
      attached_bundles: "Bundles attaches",
      guest_locked:
        "Le role Invite ne peut pas etre personnalise (la logique de facturation/limite de sieges depend de sa stabilite).",
      no_bundles_attached: "Aucun bundle attache pour le moment.",
      aria_remove_bundle: "Retirer {name}",
      add_bundle: "+ Ajouter un bundle",
      system_suffix: "Systeme",
      effective_permissions: "Permissions effectives ({count})",
      no_permissions_yet: "Ce role n'accorde encore aucune des 5 permissions concernees.",
      done: "Termine",
    },
  },
  audit_log: {
    detail_modal: {
      title: "Entree du journal d'audit",
      date: "Date",
      event: "Evenement",
      actor: "Auteur",
      system: "Systeme",
      target: "Cible",
      ip_address: "Adresse IP",
      user_agent: "User agent",
      old_value: "Ancienne valeur",
      new_value: "Nouvelle valeur",
      metadata: "Metadonnees",
    },
    details: "Details",
    toast: {
      export_started_title: "Export demarre",
      export_started_message:
        "Une fois l'export pret, vous pourrez le telecharger depuis Parametres de l'espace de travail > Exports.",
      export_failed_title: "Echec de l'export",
      export_failed_message: "Une erreur est survenue lors du demarrage de l'export. Veuillez reessayer.",
    },
    filters: {
      from_date: "Date de debut",
      to_date: "Date de fin",
      actor: "Auteur",
      target: "Cible",
    },
    export_csv: "Exporter en CSV",
    table: {
      date_time: "Date / Heure",
      event: "Evenement",
      actor: "Auteur",
      target: "Cible",
      ip: "IP",
    },
    empty: {
      title: "Aucune entree dans le journal d'audit",
      description: "Aucun evenement de securite ne correspond aux filtres actuels.",
    },
    pagination: {
      previous: "Precedent",
    },
  },
  scim: {
    create_token_modal: {
      toast: {
        failed_title: "Impossible de generer le jeton",
      },
      title: "Generer un jeton SCIM",
      description:
        "Donnez-lui un libelle qui vous permettra de reconnaitre a quel fournisseur d'identite il appartient.",
      label: "Libelle",
      label_placeholder: "Okta - Prod",
      submit: "Generer le jeton",
    },
    provisioning_log: {
      status_filter: {
        all: "Tous les statuts",
      },
      search_placeholder: "Rechercher par e-mail (page actuelle)",
      status: "Statut",
      empty: {
        title: "Aucun evenement de provisionnement",
        description: "Aucun evenement de provisionnement SCIM ne correspond aux filtres actuels.",
      },
    },
    provisioning_panel: {
      token_heading: {
        title: "Jeton SCIM",
        description:
          "Generez un jeton et connectez-le a votre fournisseur d'identite (Okta, Azure AD, Google Workspace) pour creer, mettre a jour et desactiver automatiquement les membres.",
      },
      log_heading: {
        title: "Journal de provisionnement",
        description:
          "Les 90 derniers jours d'evenements SCIM (creation/mise a jour/desactivation/erreur de synchronisation) pour cet espace de travail.",
      },
    },
    token_panel: {
      toast: {
        copied_title: "Copie",
        copied_message: "URL de base copiee dans le presse-papiers.",
        revoke_failed_title: "Erreur !",
        revoke_failed_message: "Impossible de revoquer ce jeton.",
      },
      base_url: "URL de base",
      description:
        "Generez un jeton et collez-le, avec l'URL de base ci-dessus, dans les parametres de connexion SCIM de votre fournisseur d'identite.",
      empty: "Aucun jeton SCIM pour le moment. Generez-en un pour connecter un fournisseur d'identite.",
      status_active: "Actif",
      status_revoked: "Revoque",
      created_at: "Cree le {date}",
      last_used: " - Derniere utilisation {time}",
      never_used: " - Jamais utilise",
      revoke: "Revoquer",
      revoke_modal: {
        title: "Revoquer le jeton SCIM",
        content:
          "Etes-vous sur de vouloir revoquer « {label} » ? Cette action est immediate et irreversible - votre fournisseur d'identite ne pourra plus se synchroniser avec ce jeton.",
      },
    },
  },
  reauth_modal: {
    errors: {
      enter_password: "Saisissez votre mot de passe pour continuer.",
      incorrect_password: "Mot de passe incorrect. Veuillez reessayer.",
      code_send_failed: "Impossible d'envoyer un code de verification. Veuillez reessayer.",
      enter_code: "Saisissez le code que vous avez recu par e-mail.",
      invalid_code: "Code invalide ou expire. Veuillez reessayer.",
    },
    toast: {
      code_sent_title: "Code envoye",
      code_sent_message: "Verifiez votre e-mail pour trouver le code de verification.",
    },
    title: "Confirmez que c'est vous",
    description: "Cette action est sensible et necessite de reconfirmer votre identite.",
    password_label: "Mot de passe",
    password_placeholder: "Saisissez votre mot de passe",
    use_email_code: "Utiliser un code par e-mail a la place",
    magic_code_request_description: "Nous enverrons un code de verification a usage unique a votre adresse e-mail.",
    verification_code_label: "Code de verification",
    verification_code_placeholder: "Saisissez le code a 6 chiffres",
    use_password: "Utiliser votre mot de passe a la place",
    send_code: "Envoyer le code",
  },
  security_policy_panel: {
    toast: {
      updated_title: "Politique de securite mise a jour",
      updated_message: "La politique de securite de votre espace de travail a ete enregistree.",
      save_failed_title: "Impossible d'enregistrer la politique de securite",
    },
    enforce_sso: {
      title: "Forcer la connexion via SSO uniquement",
      description:
        "Bloque la connexion par e-mail/mot de passe et par lien magique pour les membres dont l'e-mail appartient a un domaine verifie ci-dessous. Necessite qu'au moins une methode OAuth soit activee sur cette instance.",
    },
    invite_restriction: {
      title: "Qui peut inviter des membres",
    },
    session_timeout: {
      title: "Delai d'inactivite de session",
      description:
        "Les membres sont deconnectes de cet espace de travail apres ce nombre de minutes d'inactivite. Laissez vide pour utiliser le plafond d'inactivite par defaut de votre instance, configure par votre administrateur d'instance.",
      placeholder: "Valeur par defaut de l'instance",
    },
    require_reauth: {
      title: "Exiger une nouvelle authentification pour les actions sensibles",
      description:
        "La suppression de l'espace de travail, l'export complet des donnees, les modifications de la politique de securite et la revocation de jetons API demanderont aux membres de reconfirmer leur identite si leur derniere connexion date de plus de 15 minutes.",
    },
    allowed_auth_methods: {
      title: "Methodes d'authentification autorisees",
      description:
        "Sous-ensemble des methodes activees sur cette instance avec lesquelles les membres de cet espace de travail peuvent se connecter.",
    },
  },
  verified_domains_panel: {
    toast: {
      verified_title: "Domaine verifie",
      verify_failed_title: "Echec de la verification",
      removed_title: "Domaine supprime",
      removed_message: "Le domaine verifie a ete supprime.",
      remove_failed_title: "Impossible de supprimer le domaine",
    },
    description:
      "Domaines dont vous avez prouve la propriete - requis avant de pouvoir y forcer la connexion via SSO uniquement.",
    add_domain: "Ajouter un domaine",
    empty: {
      title: "Aucun domaine verifie pour le moment",
      description_owner: "Ajoutez un domaine pour commencer a y forcer la connexion via SSO uniquement.",
      description_non_owner: "Le proprietaire de l'espace de travail n'a pas encore ajoute de domaine verifie.",
    },
    table: {
      domain: "Domaine",
      method: "Methode",
      status: "Statut",
      verified_at: "Verifie le",
    },
    status_verified: "Verifie",
    status_pending: "En attente",
    verify_now: "Verifier maintenant",
    remove_modal: {
      title: "Supprimer le domaine verifie",
      content:
        "Etes-vous sur de vouloir supprimer ce domaine verifie ? Toute application du SSO qui en depend cessera de s'appliquer.",
    },
  },
  transfer_ownership_modal: {
    toast: {
      success_title: "Propriete transferee",
      success_message: "La propriete de l'espace de travail a ete transferee avec succes.",
      error_title: "Erreur !",
      error_message: "Une erreur est survenue lors du transfert de propriete. Veuillez reessayer.",
    },
    title: "Transferer la propriete de l'espace de travail",
    description_prefix: "Vous etes sur le point de transferer la propriete de",
    description_suffix:
      ". Vous resterez Administrateur, mais vous perdrez l'acces aux parametres de securite et au journal d'audit. Cette action ne peut pas etre annulee par vous seul.",
    new_owner_label: "Nouveau proprietaire",
    select_admin_placeholder: "Selectionner un administrateur",
    no_eligible_admin: "Aucun autre administrateur actif n'est disponible pour recevoir la propriete.",
    confirm_name_label: "Saisissez le nom de cet espace de travail pour confirmer.",
    submit: "Transferer la propriete",
    transferring: "Transfert en cours...",
  },
} as const;
