import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { authPalette, typography } from '@/constants/theme';
import {
  createCategory,
  deleteCategory,
  getCategories,
  type Category,
  type CategoryType,
  updateCategorySettings,
} from '@/lib/api/categories';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/providers/AuthProvider';

const COLORS = authPalette;
const CATEGORY_TYPES: CategoryType[] = ['expense', 'income', 'both'];
const COLOR_OPTIONS = ['#7C3AED', '#22C55E', '#F59E0B', '#F06A63', '#6366F1', '#14B8A6'];
const ICON_OPTIONS = ['tag', 'shopping-basket', 'briefcase', 'car', 'book', 'heartbeat', 'television'];

type DraftState = {
  color: string;
  display_name: string;
  icon: string;
  is_hidden: boolean;
  monthly_budget_limit: string;
  name: string;
  type: CategoryType;
};

export default function CategorySettingsScreen() {
  const { getValidAccessToken } = useAuth();
  const isFocused = useIsFocused();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFocused) {
      void loadCategories();
    }
  }, [isFocused]);

  const visibleCategories = useMemo(
    () =>
      [...categories].sort((left, right) => {
        if (left.is_hidden !== right.is_hidden) {
          return left.is_hidden ? 1 : -1;
        }

        return left.effective_name.localeCompare(right.effective_name);
      }),
    [categories],
  );

  async function loadCategories() {
    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      const result = await getCategories(accessToken, true);
      setCategories(result);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load categories.');
    } finally {
      setIsLoading(false);
    }
  }

  function openCreateModal() {
    setEditingCategory(null);
    setDraft(emptyDraft());
    setIsCreateOpen(true);
  }

  function openEditModal(category: Category) {
    setEditingCategory(category);
    setDraft({
      color: category.color ?? '#7C3AED',
      display_name: category.display_name ?? category.effective_name,
      icon: category.icon ?? 'tag',
      is_hidden: category.is_hidden,
      monthly_budget_limit: category.monthly_budget_limit ?? '',
      name: category.effective_name,
      type: category.type,
    });
    setIsCreateOpen(true);
  }

  function closeModal() {
    setIsCreateOpen(false);
    setEditingCategory(null);
    setDraft(emptyDraft());
  }

  async function handleSaveCategory() {
    setIsSaving(true);
    setError(null);

    try {
      const accessToken = await getValidAccessToken();
      if (!accessToken) {
        throw new Error('Your session expired. Please log in again.');
      }

      if (editingCategory) {
        await updateCategorySettings(accessToken, editingCategory.id, {
          display_name: draft.display_name.trim(),
          is_hidden: draft.is_hidden,
          monthly_budget_limit: draft.monthly_budget_limit.trim() ? draft.monthly_budget_limit.trim() : null,
        });
      } else {
        await createCategory(accessToken, {
          color: draft.color,
          icon: draft.icon,
          name: draft.name.trim(),
          type: draft.type,
        });
      }

      closeModal();
      await loadCategories();
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not save category.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteCategory(category: Category) {
    Alert.alert(
      'Delete category',
      `Delete "${category.effective_name}"? This only works for custom categories.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const accessToken = await getValidAccessToken();
              if (!accessToken) {
                throw new Error('Your session expired. Please log in again.');
              }

              await deleteCategory(accessToken, category.id);
              await loadCategories();
            } catch (caughtError) {
              setError(caughtError instanceof Error ? caughtError.message : 'Could not delete category.');
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeButton}>
            <FontAwesome color="#888888" name="close" size={16} />
          </Pressable>
          <Text style={styles.headerTitle}>Category settings</Text>
          <Text style={styles.headerCopy}>Rename categories, set budget limits, hide unused ones, or add custom categories.</Text>
        </View>

        <View style={styles.body}>
          <Pressable onPress={openCreateModal} style={styles.addButton}>
            <FontAwesome color="#FFFFFF" name="plus" size={13} />
            <Text style={styles.addButtonText}>Create custom category</Text>
          </Pressable>

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={COLORS.violet} />
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!isLoading &&
            !error &&
            visibleCategories.map((category) => (
              <View key={category.id} style={styles.categoryCard}>
                <View style={styles.categoryTop}>
                  <View style={[styles.categoryIcon, { backgroundColor: getIconBackground(category.color) }]}>
                    <FontAwesome color={category.color ?? COLORS.violet} name={mapIcon(category.icon)} size={14} />
                  </View>
                  <View style={styles.categoryMeta}>
                    <Text style={styles.categoryName}>{category.effective_name}</Text>
                    <Text style={styles.categorySubtitle}>
                      {category.type.toUpperCase()} · {category.is_custom ? 'Custom' : 'Default'}
                      {category.is_hidden ? ' · Hidden' : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => openEditModal(category)} style={styles.inlineButton}>
                    <Text style={styles.inlineButtonText}>Edit</Text>
                  </Pressable>
                </View>

                <View style={styles.categoryBottom}>
                  <Text style={styles.categoryBudget}>
                    Budget:{' '}
                    {category.monthly_budget_limit ? category.monthly_budget_limit : 'None'}
                  </Text>
                  {category.is_custom ? (
                    <Pressable onPress={() => void handleDeleteCategory(category)} style={styles.deleteChip}>
                      <Text style={styles.deleteChipText}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
        </View>
      </ScrollView>

      <Modal animationType="slide" onRequestClose={closeModal} transparent visible={isCreateOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCategory ? 'Edit category' : 'Create category'}</Text>
              <Pressable onPress={closeModal} style={styles.modalCloseButton}>
                <FontAwesome color="#888888" name="close" size={15} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {editingCategory ? (
                <>
                  <FieldLabel label="Display name" />
                  <TextInput
                    onChangeText={(value) => setDraft((current) => ({ ...current, display_name: value }))}
                    placeholder="Visible category name"
                    placeholderTextColor="#5F6370"
                    style={styles.input}
                    value={draft.display_name}
                  />
                  <FieldLabel label="Monthly budget limit" />
                  <TextInput
                    keyboardType="decimal-pad"
                    onChangeText={(value) => setDraft((current) => ({ ...current, monthly_budget_limit: value }))}
                    placeholder="Optional limit"
                    placeholderTextColor="#5F6370"
                    style={styles.input}
                    value={draft.monthly_budget_limit}
                  />
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleRowLabel}>Hide category</Text>
                    <Pressable
                      onPress={() => setDraft((current) => ({ ...current, is_hidden: !current.is_hidden }))}
                      style={[styles.toggle, draft.is_hidden ? styles.toggleOn : styles.toggleOff]}
                    >
                      <View style={[styles.toggleThumb, draft.is_hidden ? styles.toggleThumbOn : styles.toggleThumbOff]} />
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <FieldLabel label="Category name" />
                  <TextInput
                    onChangeText={(value) => setDraft((current) => ({ ...current, name: value }))}
                    placeholder="New category"
                    placeholderTextColor="#5F6370"
                    style={styles.input}
                    value={draft.name}
                  />
                  <FieldLabel label="Type" />
                  <View style={styles.optionRow}>
                    {CATEGORY_TYPES.map((type) => (
                      <SelectionPill
                        active={draft.type === type}
                        key={type}
                        label={type}
                        onPress={() => setDraft((current) => ({ ...current, type }))}
                      />
                    ))}
                  </View>
                  <FieldLabel label="Color" />
                  <View style={styles.optionRow}>
                    {COLOR_OPTIONS.map((color) => (
                      <Pressable
                        key={color}
                        onPress={() => setDraft((current) => ({ ...current, color }))}
                        style={[styles.colorSwatch, { backgroundColor: color }, draft.color === color ? styles.colorSwatchActive : null]}
                      />
                    ))}
                  </View>
                  <FieldLabel label="Icon" />
                  <View style={styles.optionRow}>
                    {ICON_OPTIONS.map((icon) => (
                      <Pressable
                        key={icon}
                        onPress={() => setDraft((current) => ({ ...current, icon }))}
                        style={[styles.iconChoice, draft.icon === icon ? styles.iconChoiceActive : null]}
                      >
                        <FontAwesome color={draft.icon === icon ? COLORS.violet : '#8C909B'} name={mapIcon(icon)} size={14} />
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.modalActionRow}>
                <Pressable onPress={closeModal} style={styles.modalSecondaryButton}>
                  <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSaving}
                  onPress={() => void handleSaveCategory()}
                  style={[styles.modalPrimaryButton, isSaving ? styles.modalButtonBusy : null]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.modalPrimaryButtonText}>Save</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function SelectionPill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.selectionPill, active ? styles.selectionPillActive : null]}>
      <Text style={[styles.selectionPillText, active ? styles.selectionPillTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function mapIcon(icon: string | null | undefined): React.ComponentProps<typeof FontAwesome>['name'] {
  switch (icon) {
    case 'shopping-basket':
      return 'shopping-basket';
    case 'briefcase':
      return 'briefcase';
    case 'car':
      return 'car';
    case 'book':
      return 'book';
    case 'heartbeat':
      return 'heartbeat';
    case 'television':
      return 'television';
    default:
      return 'tag';
  }
}

function getIconBackground(color: string | null) {
  if (color === '#22C55E') return '#0D1A12';
  if (color === '#F59E0B') return '#1F1A0E';
  if (color === '#F06A63') return '#1A100E';
  if (color === '#6366F1') return '#131520';
  if (color === '#14B8A6') return '#102021';
  return '#1A1525';
}

function emptyDraft(): DraftState {
  return {
    color: '#7C3AED',
    display_name: '',
    icon: 'tag',
    is_hidden: false,
    monthly_budget_limit: '',
    name: '',
    type: 'expense',
  };
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  content: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#161616',
    borderWidth: 0.5,
    borderColor: '#272727',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#F0F0F0',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  headerCopy: {
    color: '#7B7F8A',
    ...typography.caption,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 12,
  },
  addButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  stateCard: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    backgroundColor: 'rgba(240,106,99,0.12)',
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: COLORS.danger,
    ...typography.caption,
  },
  categoryCard: {
    backgroundColor: '#161616',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#272727',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  categoryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  categoryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryMeta: {
    flex: 1,
  },
  categoryName: {
    color: '#DDDDDD',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  categorySubtitle: {
    color: '#7B7F8A',
    fontSize: 10,
  },
  inlineButton: {
    minHeight: 30,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#1A1525',
    borderWidth: 0.5,
    borderColor: '#3D2F6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineButtonText: {
    color: '#9B72F5',
    fontSize: 10,
    fontWeight: '600',
  },
  categoryBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBudget: {
    color: '#8C909B',
    fontSize: 10,
  },
  deleteChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#1A100E',
    borderWidth: 0.5,
    borderColor: 'rgba(240,106,99,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteChipText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '88%',
    backgroundColor: '#111116',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 0.5,
    borderColor: '#23232B',
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E1E1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#F0F0F0',
    fontSize: 15,
    fontWeight: '600',
  },
  modalCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#191922',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  fieldLabel: {
    color: '#A7A9B2',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    color: '#F0F0F0',
    paddingHorizontal: 13,
    fontSize: 13,
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  selectionPill: {
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionPillActive: {
    backgroundColor: '#1A1525',
    borderColor: '#3D2F6A',
  },
  selectionPillText: {
    color: '#8C909B',
    fontSize: 11,
    fontWeight: '500',
  },
  selectionPillTextActive: {
    color: '#9B72F5',
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: '#FFFFFF',
  },
  iconChoice: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    backgroundColor: '#16161A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoiceActive: {
    borderColor: '#3D2F6A',
    backgroundColor: '#1A1525',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 6,
  },
  toggleRowLabel: {
    color: '#DDDDDD',
    fontSize: 12,
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    position: 'relative',
  },
  toggleOn: {
    backgroundColor: COLORS.violet,
  },
  toggleOff: {
    backgroundColor: '#272727',
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: 2,
  },
  toggleThumbOn: {
    left: 18,
  },
  toggleThumbOff: {
    left: 2,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 0.5,
    borderColor: '#2C2C33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: {
    color: '#8C909B',
    fontSize: 12,
    fontWeight: '600',
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalButtonBusy: {
    opacity: 0.8,
  },
});
