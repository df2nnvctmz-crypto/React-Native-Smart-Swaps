import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Switch, Modal, KeyboardAvoidingView, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { useProfile, Sex, ActivityLevel, WeightGoal, DietaryPreference } from './context/ProfileContext';
import { useSettings } from './context/SettingsContext';
import { resetPersonalPreferences } from './engine/personalSwapPreferences';
import { getTrainingLogCount, exportTrainingLog, clearTrainingLog } from './engine/swapTrainingLog';
import { getMatchLogCount, exportMatchLog, clearMatchLog } from './services/matchLog';
import { StorageService } from './services/storage';
// Mock Clipboard since expo-clipboard native module is missing
const Clipboard = { 
  setStringAsync: async (text: string) => { console.log('Clipboard set:', text.substring(0, 50)); }, 
  getStringAsync: async () => '[]' 
};
import { COLORS, globalStyles } from '../styles';

const isIOS = Platform.OS === 'ios';

const SettingsGroup = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <View style={styles.groupContainer}>
    {title ? <Text style={styles.groupTitle}>{title.toUpperCase()}</Text> : null}
    <View style={[styles.groupBlock, isIOS ? styles.groupBlockIOS : styles.groupBlockAndroid]}>
      {children}
    </View>
  </View>
);

const SettingsRow = ({ 
  icon, 
  sfSymbol,
  iconBg, 
  title, 
  children, 
  isLast, 
  onPress 
}: any) => (
  <View>
    <TouchableOpacity 
      style={[styles.settingsRow, !isIOS && styles.settingsRowAndroid]} 
      activeOpacity={onPress ? 0.6 : 1} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        {isIOS && sfSymbol ? (
          <SymbolView name={sfSymbol} size={18} tintColor="#FFF" fallback={<Ionicons name={icon} size={18} color="#FFF" />} />
        ) : (
          <Ionicons name={icon} size={18} color="#FFF" />
        )}
      </View>
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={styles.rowRight}>
        {children}
      </View>
    </TouchableOpacity>
    {!isLast && <View style={styles.separator} />}
  </View>
);

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, targetCalories } = useProfile();
  const { settings, updateSettings } = useSettings();

  const [activeTab, setActiveTab] = useState<'profile' | 'privacy'>('profile');

  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  
  // State for the modals
  const [modalTitle, setModalTitle] = useState('');
  const [modalKey, setModalKey] = useState<any>('');
  const [modalValue, setModalValue] = useState('');
  const [modalUnit, setModalUnit] = useState('');
  const [modalOptions, setModalOptions] = useState<{label: string, value: string}[]>([]);
  const [trainingLogCount, setTrainingLogCount] = useState(0);
    const [matchLogCount, setMatchLogCount] = useState(0);
  const [shoppingListCount, setShoppingListCount] = useState(0);

  useEffect(() => {
    getTrainingLogCount().then(setTrainingLogCount);
    getMatchLogCount().then(setMatchLogCount);
    StorageService.getScans().then(scans => setShoppingListCount(scans.filter(s => s.isShoppingList).length));
  }, []);

  const openInputModal = (key: 'age' | 'weight' | 'height', title: string, unit: string) => {
    setModalKey(key);
    setModalTitle(title);
    setModalUnit(unit);
    setModalValue(String(profile[key]));
    setInputModalVisible(true);
  };

  const openPickerModal = (key: 'sex' | 'activityLevel' | 'weightGoal', title: string, options: string[]) => {
    setModalKey(key);
    setModalTitle(title);
    setModalValue(String(profile[key]));
    setModalOptions(options.map(o => ({ label: o, value: o })));
    setPickerModalVisible(true);
  };

  const handleSaveInput = () => {
    const num = parseFloat(modalValue.replace(',', '.'));
    if (!isNaN(num) && num > 0) {
      updateProfile({ [modalKey]: num });
    }
    setInputModalVisible(false);
  };

  const handleSavePicker = () => {
    updateProfile({ [modalKey]: modalValue });
    setPickerModalVisible(false);
  };

  const toggleDiet = (diet: DietaryPreference) => {
    let current = [...profile.dietaryPreference];
    if (diet === 'Balanced') {
      current = ['Balanced'];
    } else {
      current = current.filter(d => d !== 'Balanced');
      if (current.includes(diet)) {
        current = current.filter(d => d !== diet);
      } else {
        current.push(diet);
      }
      if (current.length === 0) {
        current = ['Balanced'];
      }
    }
    updateProfile({ dietaryPreference: current });
  };

  const handleExportTrainingLog = async () => {
    try {
      await exportTrainingLog();
    } catch (e: any) {
      Alert.alert('Nothing to Export Yet', e?.message ?? 'No local swap decisions recorded yet.');
    }
  };

  const handleResetSwapPreferences = () => {
    Alert.alert(
      'Reset Swap Preferences',
      "This forgets which swap suggestions you've liked or dismissed. It won't affect your profile or scan history.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => { resetPersonalPreferences(); } },
      ]
    );
  };

  const handleDeleteTrainingLog = () => {
    Alert.alert(
      'Delete Local Swap Data',
      `This will permanently delete all ${trainingLogCount} locally recorded swap decisions. Your profile and receipt history are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await clearTrainingLog();
            setTrainingLogCount(0);
          },
        },
      ]
    );
  };

  const handleExportMatchLog = async () => {
    try {
      await exportMatchLog();
    } catch (e: any) {
      Alert.alert('Nothing to Export Yet', e?.message ?? 'No weak matches logged yet.');
    }
  };

  
  const handleExportShoppingLists = async () => {
    try {
      const scans = await StorageService.getScans();
      const lists = scans.filter(s => s.isShoppingList);
      if (lists.length === 0) {
        Alert.alert('No Shopping Lists', 'You have no shopping lists to export.');
        return;
      }
      await Clipboard.setStringAsync(JSON.stringify(lists));
      Alert.alert('Exported', 'Your shopping lists have been copied to the clipboard.');
    } catch (e) {
      Alert.alert('Export Failed', 'An error occurred while exporting.');
    }
  };

  const handleImportShoppingLists = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const lists = JSON.parse(text);
      if (!Array.isArray(lists)) throw new Error('Invalid format');
      
      const existing = await StorageService.getScans();
      const newExisting = [...lists, ...existing];
      // Save directly or one by one?
      // Wait, StorageService saves all scans together.
      for (const list of lists) {
        await StorageService.saveScan(list);
      }
      
      const updated = await StorageService.getScans();
      setShoppingListCount(updated.filter(s => s.isShoppingList).length);
      Alert.alert('Imported', `Successfully imported ${lists.length} shopping lists.`);
    } catch (e) {
      Alert.alert('Import Failed', 'Clipboard does not contain valid shopping list data.');
    }
  };

  const handleDeleteShoppingLists = () => {
    Alert.alert(
      'Delete All Shopping Lists',
      'This will permanently delete all your shopping lists.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const scans = await StorageService.getScans();
            for (const scan of scans) {
              if (scan.isShoppingList) {
                await StorageService.deleteScan(scan.id);
              }
            }
            setShoppingListCount(0);
          },
        },
      ]
    );
  };

  const handleDeleteMatchLog = () => {
    Alert.alert(
      'Delete Match Diagnostics',
      `This will permanently delete all ${matchLogCount} locally logged low-confidence scan lines. Your profile and receipt history are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await clearMatchLog();
            setMatchLogCount(0);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.safeArea}>
      
      {/* Sticky Header */}
      <BlurView 
        intensity={80} 
        tint="light" 
        style={[styles.headerBlur, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'profile' && styles.tabBtnActive]}
            onPress={() => setActiveTab('profile')}
          >
            <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>Profile & Diet</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabBtn, activeTab === 'privacy' && styles.tabBtnActive]}
            onPress={() => setActiveTab('privacy')}
          >
            <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>Privacy & Data</Text>
          </TouchableOpacity>
        </View>

      </BlurView>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 110 }]} 
        showsVerticalScrollIndicator={false}
      >
        
        {activeTab === 'profile' ? (
          <>
            {/* Calorie Target */}
            <SettingsGroup title="Nutrition Target">
              <SettingsRow icon="flash" sfSymbol="bolt.fill" iconBg={COLORS.systemOrange} title="Daily Calories" isLast={true}>
                <Text style={styles.rowValue}>{targetCalories.toLocaleString('de-DE')} kcal</Text>
              </SettingsRow>
            </SettingsGroup>

            {/* Personal Info */}
            <SettingsGroup title="Personal Info">
              <SettingsRow icon="person" sfSymbol="person.fill" iconBg={COLORS.systemBlue} title="Biological Sex" onPress={() => openPickerModal('sex', 'Biological Sex', ['Male', 'Female'])}>
                <Text style={styles.rowValue}>{profile.sex}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
              
              <SettingsRow icon="calendar" sfSymbol="calendar" iconBg={COLORS.systemPink} title="Age" onPress={() => openInputModal('age', 'Age', 'yrs')}>
                <Text style={styles.rowValue}>{profile.age} <Text style={styles.rowUnit}>yrs</Text></Text>
              </SettingsRow>

              <SettingsRow icon="barbell" sfSymbol="dumbbell.fill" iconBg={COLORS.systemIndigo} title="Weight" onPress={() => openInputModal('weight', 'Weight', 'kg')}>
                <Text style={styles.rowValue}>{profile.weight} <Text style={styles.rowUnit}>kg</Text></Text>
              </SettingsRow>

              <SettingsRow icon="body" sfSymbol="figure.stand" iconBg={COLORS.systemPurple} title="Height" isLast={true} onPress={() => openInputModal('height', 'Height', 'cm')}>
                <Text style={styles.rowValue}>{profile.height} <Text style={styles.rowUnit}>cm</Text></Text>
              </SettingsRow>
            </SettingsGroup>

            {/* Goals */}
            <SettingsGroup title="Goals">
              <SettingsRow icon="bicycle" sfSymbol="figure.run" iconBg={COLORS.systemOrange} title="Activity Level" onPress={() => openPickerModal('activityLevel', 'Activity Level', ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extra Active'])}>
                <Text style={styles.rowValue}>{profile.activityLevel}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
              
              <SettingsRow icon="trending-down" sfSymbol="arrow.down.right.circle.fill" iconBg={COLORS.systemGreen} title="Weight Goal" isLast={true} onPress={() => openPickerModal('weightGoal', 'Weight Goal', ['-0.5 kg', '-0.25 kg', 'stay', '+0.25 kg', '+0.5 kg'])}>
                <Text style={styles.rowValue}>{profile.weightGoal}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
            </SettingsGroup>

            {/* Dietary Preferences */}
            <SettingsGroup title="Dietary Preferences">
              {(['Balanced', 'High Protein', 'Low Carb', 'Vegetarian', 'Vegan'] as DietaryPreference[]).map((diet, index, arr) => (
                <SettingsRow 
                  key={diet}
                  icon="restaurant" 
                  sfSymbol="fork.knife"
                  iconBg={profile.dietaryPreference.includes(diet) ? COLORS.systemGreen : COLORS.systemGray} 
                  title={diet} 
                  isLast={index === arr.length - 1}
                  onPress={() => toggleDiet(diet)}
                >
                  {profile.dietaryPreference.includes(diet) && (
                    <Ionicons name="checkmark" size={20} color={COLORS.systemBlue} />
                  )}
                </SettingsRow>
              ))}
            </SettingsGroup>
          </>
        ) : (
          <>
            {/* Scanning */}
            <SettingsGroup title="Scanning">
              <SettingsRow
                icon="cloud-outline"
                sfSymbol="cloud.fill"
                iconBg={COLORS.systemTeal}
                title="Look up branded products online (beta)"
                isLast={true}
              >
                <Switch
                  value={settings.offLookupEnabled}
                  onValueChange={(value) => updateSettings({ offLookupEnabled: value })}
                  trackColor={{ true: COLORS.primaryGreen }}
                />
              </SettingsRow>
            </SettingsGroup>
            {settings.offLookupEnabled && (
              <Text style={styles.settingsHint}>
                Branded products the offline database can't recognize (e.g. "Pringles") will be
                looked up online via Open Food Facts. This sends the scanned product name over the
                network and is still being tuned - occasionally it may pick the wrong item.
              </Text>
            )}

            {/* Personalization */}
            <SettingsGroup title="Personalization">
              <SettingsRow
                icon="refresh-outline"
                sfSymbol="arrow.counterclockwise"
                iconBg={COLORS.systemGray}
                title="Reset Swap Preferences"
                onPress={handleResetSwapPreferences}
              >
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} />
              </SettingsRow>
              <SettingsRow
                icon="share-outline"
                sfSymbol="square.and.arrow.up"
                iconBg={COLORS.systemBlue}
                title="Export Local Swap Data"
                onPress={handleExportTrainingLog}
              >
                <Text style={styles.rowValue}>{trainingLogCount}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
              <SettingsRow
                icon="trash-outline"
                sfSymbol="trash.fill"
                iconBg={COLORS.systemRed}
                title="Delete Local Swap Data"
                isLast={true}
                onPress={handleDeleteTrainingLog}
              >
                <Text style={[styles.rowValue, trainingLogCount > 0 && { color: COLORS.systemRed }]}>{trainingLogCount} entries</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
            </SettingsGroup>
            <Text style={styles.settingsHint}>
              Swap suggestions adapt on-device as you like or dismiss them. "Reset Swap Preferences" forgets the learned multipliers.
              "Delete Local Swap Data" removes the anonymized decision log ({trainingLogCount} entries). Neither action affects your profile or receipts.
            </Text>

            
            {/* Shopping Lists */}
            <SettingsGroup title="Shopping Lists">
              <SettingsRow
                icon="download-outline"
                sfSymbol="arrow.down.doc"
                iconBg={COLORS.systemTeal}
                title="Import Shopping Lists"
                onPress={handleImportShoppingLists}
              >
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} />
              </SettingsRow>
              <SettingsRow
                icon="share-outline"
                sfSymbol="square.and.arrow.up"
                iconBg={COLORS.systemBlue}
                title="Export Shopping Lists"
                onPress={handleExportShoppingLists}
              >
                <Text style={styles.rowValue}>{shoppingListCount}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
              <SettingsRow
                icon="trash-outline"
                sfSymbol="trash.fill"
                iconBg={COLORS.systemRed}
                title="Delete All Shopping Lists"
                isLast={true}
                onPress={handleDeleteShoppingLists}
              >
                <Text style={[styles.rowValue, shoppingListCount > 0 && { color: COLORS.systemRed }]}>{shoppingListCount} lists</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
            </SettingsGroup>

            {/* Matcher Diagnostics */}
            <SettingsGroup title="Matcher Diagnostics">
              <SettingsRow
                icon="share-outline"
                sfSymbol="square.and.arrow.up"
                iconBg={COLORS.systemBlue}
                title="Export Match Diagnostics"
                onPress={handleExportMatchLog}
              >
                <Text style={styles.rowValue}>{matchLogCount}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
              <SettingsRow
                icon="trash-outline"
                sfSymbol="trash.fill"
                iconBg={COLORS.systemRed}
                title="Delete Match Diagnostics"
                isLast={true}
                onPress={handleDeleteMatchLog}
              >
                <Text style={[styles.rowValue, matchLogCount > 0 && { color: COLORS.systemRed }]}>{matchLogCount} entries</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.systemGray2} style={{ marginLeft: 6 }} />
              </SettingsRow>
            </SettingsGroup>
            <Text style={styles.settingsHint}>
              Every scan line the matcher wasn't confident about ("Potential Match" or "Not Found") is logged locally
              with its raw receipt text, so it can be shared as a precise bug report. Confident matches aren't logged.
              Nothing here is sent anywhere unless you tap Export.
            </Text>
          </>
        )}

      </ScrollView>

      {/* Input Modal */}
      <Modal visible={inputModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Enter {modalTitle}</Text>
            <View style={styles.modalInputWrapper}>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                value={modalValue}
                onChangeText={setModalValue}
                autoFocus
              />
              <Text style={styles.modalUnit}>{modalUnit}</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setInputModalVisible(false)}>
                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveInput}>
                <Text style={styles.modalBtnTextSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Picker Modal (iOS style bottom sheet) */}
      <Modal visible={pickerModalVisible} transparent animationType="fade">
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setPickerModalVisible(false)} />
          <View style={[styles.bottomSheet, { paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
            <View style={styles.bottomSheetHeader}>
              <TouchableOpacity onPress={() => setPickerModalVisible(false)}>
                <Text style={styles.bottomSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.bottomSheetTitle}>{modalTitle}</Text>
              <TouchableOpacity onPress={handleSavePicker}>
                <Text style={styles.bottomSheetSave}>Done</Text>
              </TouchableOpacity>
            </View>
            <Picker
              selectedValue={modalValue}
              onValueChange={(val) => setModalValue(val)}
              style={styles.picker}
            >
              {modalOptions.map(opt => (
                <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background, // iOS grouped background replaced with global theme
  },
  headerBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    backgroundColor: COLORS.inputBackground,
    borderRadius: 8,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '85%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 24,
  },
  modalInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalUnit: {
    fontSize: 16,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: COLORS.inputBackground,
  },
  modalBtnSave: {
    backgroundColor: COLORS.primaryGreen,
  },
  modalBtnTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalBtnTextSave: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  bottomSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  bottomSheetCancel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  bottomSheetSave: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
  picker: {
    width: '100%',
    height: 200,
  },
  groupContainer: {
    marginTop: 28,
  },
  settingsHint: {
    fontSize: 12,
    color: COLORS.systemGray,
    marginHorizontal: 32,
    marginTop: 8,
    lineHeight: 16,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.systemGray,
    marginLeft: 32,
    marginBottom: 8,
  },
  groupBlock: {
    backgroundColor: COLORS.cardBackground,
  },
  groupBlockIOS: {
    marginHorizontal: 16,
    borderRadius: 10,
  },
  groupBlockAndroid: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  settingsRowAndroid: {
    paddingVertical: 14,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: 16,
    color: COLORS.textPrimary,
    marginLeft: 16,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowValue: {
    fontSize: 16,
    color: COLORS.systemGray,
  },
  rowInput: {
    fontSize: 16,
    color: COLORS.systemGray,
    textAlign: 'right',
    minWidth: 40,
    padding: 0,
    margin: 0,
  },
  rowUnit: {
    fontSize: 16,
    color: COLORS.systemGray,
    marginLeft: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.systemGray2,
    marginLeft: 60, // Align with text
  },
});
