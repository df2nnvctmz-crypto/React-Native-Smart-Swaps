import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../styles';
import { useInventory } from '../app/context/InventoryContext';
import { ScanRecord } from '../app/services/storage';

interface SelectShoppingListModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (listId: string | null, newListName?: string) => void;
}

export const SelectShoppingListModal: React.FC<SelectShoppingListModalProps> = ({ visible, onClose, onSelect }) => {
  const { shoppingLists } = useInventory();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newListName, setNewListName] = useState('');

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={styles.container}
        >
          <View style={styles.modalContent}>
            <View style={globalStyles.rowBetween}>
              <Text style={styles.title}>Add to Shopping List</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {isCreatingNew ? (
              <View style={styles.newListContainer}>
                <Text style={styles.label}>New List Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Weekend Groceries"
                  value={newListName}
                  onChangeText={setNewListName}
                  autoFocus
                />
                <View style={[globalStyles.row, { marginTop: 16, gap: 12 }]}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsCreatingNew(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.createBtn, !newListName.trim() && { opacity: 0.5 }]} 
                    onPress={() => {
                      if (newListName.trim()) {
                        onSelect(null, newListName.trim());
                        setNewListName('');
                        setIsCreatingNew(false);
                      }
                    }}
                    disabled={!newListName.trim()}
                  >
                    <Text style={styles.createBtnText}>Create & Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
                <TouchableOpacity 
                  style={styles.listItem}
                  onPress={() => setIsCreatingNew(true)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: COLORS.lightGreenBg }]}>
                    <Ionicons name="add" size={20} color={COLORS.primaryGreen} />
                  </View>
                  <Text style={styles.listItemTextCreate}>Create New List</Text>
                </TouchableOpacity>

                {shoppingLists.map((list) => (
                  <TouchableOpacity 
                    key={list.id}
                    style={styles.listItem}
                    onPress={() => onSelect(list.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.iconBox}>
                      <Ionicons name="basket" size={20} color={'#0084C9'} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.listItemText}>{list.recipeName || 'Shopping List'}</Text>
                      <Text style={styles.listItemSubtext}>{list.items.length} items</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  listContainer: {
    marginTop: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0FAFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItemTextCreate: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    marginLeft: 12,
  },
  listItemText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  listItemSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  newListContainer: {
    marginTop: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.inputBackground,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  createBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});
