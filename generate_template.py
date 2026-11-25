import json
import csv

with open('public/models/atlas.json', 'r') as f:
    data = json.load(f)

with open('public/anatomy_template.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Concept_ID', 'Original_English_Name', 'Medical_Latin_Name', 'Indonesian_Name', 'SNOMED_CT_Code', 'Description'])
    for c in data['concepts']:
        writer.writerow([c['id'], c['name'], '', '', '', ''])

print("Generated public/anatomy_template.csv")
