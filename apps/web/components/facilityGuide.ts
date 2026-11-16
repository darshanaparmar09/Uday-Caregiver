// Visit checklist for families choosing a care facility. Based on the guide Darshana supplied; wording is Uday's.
export const FACILITY_TYPES_EXPLAINED: [string, string][] = [
  ["Assisted living", "A home like setting with help for daily activities such as bathing, meals and medicines. Rooms, apartments or shared quarters."],
  ["Nursing home (skilled nursing)", "Nurses and aides on hand 24 hours. For people too unwell for home care but not needing a hospital, and for short rehabilitation after a hospital stay."],
  ["Memory care", "Specialised care for people living with dementia or Alzheimer's, with trained staff, a set daily routine and a safe layout."],
  ["Retirement community", "Independent living with assisted living and nursing care on the same campus, so a resident can stay as needs change. Usually an entry fee plus a monthly fee, and many do not accept people who already need care."],
  ["Short stay and respite", "A stay of days or weeks, for recovery or to give a family carer a break."],
];
export const CHOOSING_STEPS: [string, string][] = [
  ["Decide the level of care", "Be explicit about what your parent needs today and is likely to need soon."],
  ["Think about the setting", "City or suburb, close to family, near their own neighbourhood, pets, and diet such as vegetarian or Jain."],
  ["Set a budget", "Monthly fee, one time entry or community fee, and extra charges for medicines or therapy. Ask what is refundable."],
  ["Visit before you decide", "Online research only goes so far. Visit at least twice, once without notice if allowed, and use the checklist below."],
];
export const VISIT_CHECKLIST: { group: string; items: [string, string][] }[] = [
  { group: "General", items: [["needs", "Can they meet every one of my parent's needs? (share everything)"], ["ratio", "Caregivers to residents: at least 1 to 15 in assisted living, 1 to 8 in memory care"], ["move", "What would make a resident move to another level of care?"], ["doctors", "Which doctors and therapists visit, and how often?"]] },
  { group: "Residents", items: [["happy", "Residents say they like living here"], ["visitors", "Visiting families speak well of it"], ["engaged", "Residents are engaged in activities, not alone in rooms"], ["together", "Residents interact well with each other and staff"]] },
  { group: "Staff", items: [["friendly", "Staff are friendly, greet you and make eye contact"], ["attention", "Staff get residents' attention respectfully"], ["floor", "Staff are out on the floor, not gathered at the desk"], ["know", "Staff know residents' likes and needs"]] },
  { group: "Activities", items: [["daily", "Activities happen daily, and you saw the schedule"], ["levels", "Activities suit different abilities"], ["outings", "Outings to parks, shopping or temples are offered"], ["faith", "Prayer or religious services are arranged"]] },
  { group: "Setting", items: [["home", "It feels like a home, not a hospital"], ["own_things", "Residents can bring their own furniture and belongings"]] },
  { group: "Security", items: [["entry", "Clear control of who comes in and goes out"], ["wandering", "Safe layout that prevents wandering"]] },
  { group: "Cleanliness", items: [["surfaces", "Floors, walls and surfaces are clean"], ["bathrooms", "Bathrooms are clean"], ["odours", "No unpleasant smells in common areas or rooms"]] },
  { group: "Dementia", items: [["training", "Staff are trained in dementia care"], ["unit", "There is a separate dementia unit, with the right licence"], ["routine", "There is a daily routine for residents with dementia"]] },
  { group: "Costs", items: [["monthly", "Basic monthly cost is clear"], ["extras", "Extra costs for medicines or treatment are written down"], ["entry", "One time fees are clear"], ["refund", "You know what is refunded if your parent leaves"]] },
];
