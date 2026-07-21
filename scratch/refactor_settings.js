const fs = require('fs');
const filepath = 'app/settings.tsx';
let content = fs.readFileSync(filepath, 'utf8');

const imports = `import { clearMatchLog, exportMatchLog, getMatchLogCount } from './engine/receiptMatcher';
import { StorageService } from './services/storage';
import * as Clipboard from 'expo-clipboard';`;

content = content.replace("import { clearMatchLog, exportMatchLog, getMatchLogCount } from './engine/receiptMatcher';", imports);

const stateHook = `  const [matchLogCount, setMatchLogCount] = useState(0);
  const [shoppingListCount, setShoppingListCount] = useState(0);`;

content = content.replace("const [matchLogCount, setMatchLogCount] = useState(0);", stateHook);

const fetchHook = `  useEffect(() => {
    getMatchLogCount().then(setMatchLogCount);
    getTrainingLogCount().then(setTrainingLogCount);
    StorageService.getScans().then(scans => {
      setShoppingListCount(scans.filter(s => s.isShoppingList).length);
    });
  }, []);`;

content = content.replace(`  useEffect(() => {
    getMatchLogCount().then(setMatchLogCount);
    getTrainingLogCount().then(setTrainingLogCount);
  }, []);`, fetchHook);

const handlers = `
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
      Alert.alert('Imported', \`Successfully imported \${lists.length} shopping lists.\`);
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
`;

content = content.replace("const handleDeleteMatchLog = () => {", handlers + "\n  const handleDeleteMatchLog = () => {");

const uiGroup = `
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
`;

content = content.replace("{/* Matcher Diagnostics */}", uiGroup + "\n            {/* Matcher Diagnostics */}");

fs.writeFileSync(filepath, content, 'utf8');
