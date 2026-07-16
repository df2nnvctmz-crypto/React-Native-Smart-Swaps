import json
import time
import sys
from deep_translator import GoogleTranslator

def load_foods(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_foods(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def main():
    filepath = 'foods.json'
    try:
        foods = load_foods(filepath)
    except Exception as e:
        print(f"Error loading foods: {e}")
        return
    
    print(f"Loaded {len(foods)} foods.")
    
    translator = GoogleTranslator(source='en', target='de')
    
    batch_size = 500
    total_translated = 0
    
    for i, food in enumerate(foods):
        if 'name_de' not in food or not food['name_de']:
            try:
                food['name_de'] = translator.translate(food['name'])
                total_translated += 1
                if total_translated % 100 == 0:
                    print(f"Translated {total_translated} items... (current: {food['name_de']})")
            except Exception as e:
                print(f"Error translating item {food['id']} ({food['name']}): {e}")
                save_foods(filepath, foods)
                time.sleep(2)
                try:
                    food['name_de'] = translator.translate(food['name'])
                    total_translated += 1
                except Exception as e2:
                    print(f"Failed retry for {food['id']}: {e2}")
                    food['name_de'] = food['name'] # Fallback
        
        if i > 0 and i % batch_size == 0:
            save_foods(filepath, foods)
            print(f"Saved progress at {i} items.")
            
    save_foods(filepath, foods)
    print(f"Done! Translated {total_translated} new items.")

if __name__ == '__main__':
    main()
