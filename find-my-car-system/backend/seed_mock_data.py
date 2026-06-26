from firebase_config import db
from datetime import datetime
import re


def clean_plate_number(plate_number):
    plate_number = plate_number.upper()
    plate_number = re.sub(r"[^A-Z0-9]", "", plate_number)
    return plate_number


mock_cars = [
    {
        "uid": "FMJkuneOckVmb4Irb6vsr961oBI3",
        "name": "Pavetran",
        "email": "tp067847@mail.apu.edu.my",
        "student_id": "TP067847",
        "car_model": "Toyota Vios",
        "car_colour": "Grey",
        "car_plate": "AKD 9878",
        "is_oku": False,

        "parking_zone": "Zone B",
        "parking_row": "Row 12",
        "parking_slot": "B12-08",
        "image_url": "http://127.0.0.1:5002/static/car_images/AKD9878.jpg",
        "status": "parked",
        "entry_time": "2026-06-26T10:15:00",
        "exit_time": None,
        "created_at": datetime.now().isoformat()
    },
    {
        "uid": "Ggo3vrNZdRRUCUHz3OG18VDrd001",
        "name": "Khaillash",
        "email": "tp070452@mail.apu.edu.my",
        "student_id": "TP070452",
        "car_model": "Perodua Bezza",
        "car_colour": "Red",
        "car_plate": "VCG 7127",
        "is_oku": False,

        "parking_zone": "Zone A",
        "parking_row": "Row 4",
        "parking_slot": "A04-02",
        "image_url": "http://127.0.0.1:5002/static/car_images/VCG7127.jpg",
        "status": "parked",
        "entry_time": "2026-06-26T11:30:00",
        "exit_time": None,
        "created_at": datetime.now().isoformat()
    }
]


for car in mock_cars:
    car_plate_search = clean_plate_number(car["car_plate"])
    car["car_plate_search"] = car_plate_search

    db.collection("find_my_car").document(car_plate_search).set(car)

    print(f"Added document: find_my_car/{car_plate_search}")

print("Mock Find My Car data added successfully.")