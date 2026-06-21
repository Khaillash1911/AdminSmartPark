from ultralytics import YOLO
from shapely.geometry import Polygon
import matplotlib.pyplot as plt
import json
import cv2

imgPath = '../plate_detector/sample_images/img6.jpg'
model = YOLO('yolov8n.pt')  # 'n' = nano (fast) ideal for realtime stuff that we are aiming for
results = model(imgPath, classes = [2])  # path to your image, class 2 for cars
print(results[0].boxes)

# Open and read the file with the marked parking spots
with open('parking_points.json', 'r') as f:
    data = json.load(f)

# Variables to determine free and occupied
free = len(data['Parking_Cam_1'])
occupied = 0
output_data = {'Parking_Cam_1': {}}
car_index = 1

for xyxy in results[0].boxes.xyxy:
    x1, y1, x2, y2 = xyxy.tolist()
    car_coords = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]

    for (spot_id, parking_spot) in data['Parking_Cam_1'].items():
        
        parking_spot = Polygon(parking_spot)
        car_coords = Polygon(car_coords)

        # Calculate Intersection of Union to determine overlap of parking spot and car
        # Calculated by area of intersection / area of union of polygons (sum of both areas - area of intersections)
        intersection = parking_spot.intersection(car_coords).area
        union = parking_spot.union(car_coords).area
        iou = intersection / union

        print(f"The iou for car {car_index} at spot {spot_id} is {iou}")
        if iou > 0.3:
            occupied +=1
            free -=1
            output_data['Parking_Cam_1'][spot_id] = True
        else:
            output_data['Parking_Cam_1'][spot_id] = False

    car_index +=1

print("Free Spaces Available: " + str(free))
print("Occupied: " + str(occupied))
print(output_data)

fig, ax = plt.subplots()
img_bgr = cv2.imread(imgPath) # bgr by default
img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
ax.imshow(img)

for xyxy in results[0].boxes.xyxy:
    x1, y1, x2, y2 = xyxy.tolist()
    car_xs = [x1, x2, x2, x1, x1]
    car_ys = [y1, y1, y2, y2, y1]
    ax.plot(car_xs, car_ys, color='blue', linewidth=2)

for (spot_id, parking_spot) in data['Parking_Cam_1'].items():
    # Convert tuples to lists so you can append the first point
    spot_xs, spot_ys = map(list, zip(*parking_spot))
    spot_xs.append(spot_xs[0])
    spot_ys.append(spot_ys[0])    
    ax.plot(spot_xs, spot_ys, color='red', linewidth=2)


plt.show()