Ext.define("CumulativeFlowCalculator", {
     extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
     config: {
         stateFieldName: 'ScheduleState',
         stateFieldValues: ['Defined', 'In-Progress', 'Completed', 'Accepted', 'Finished'],
         totalPoints: 0
     },
     InProgressName: 'In-Progress',
     AcceptedName: 'Accepted',
     runCalculation: function (snapshots) {
         var calculatorConfig = this._prepareCalculatorConfig(),
             seriesConfig = this._buildSeriesConfig(calculatorConfig);

         var calculator = this.prepareCalculator(calculatorConfig);
         calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));
         
         var calcs = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);

         //get planned start date
         var actual_series = this._getActualSeries(calcs);
         calcs.series.push(actual_series);
        
         var ideal_series = this._getIdealSeries(calcs);
         calcs.series.push(ideal_series);
         
         //Format the categories by week 
         var new_categories = _.map(calcs.categories, function(c){
             var week = Rally.util.DateTime.format(new Date(c), 'W');
             var year = Rally.util.DateTime.format(new Date(c),'Y');
             return year.toString() + 'WW' + week.toString(); 
         });
         calcs.categories = new_categories;
         return calcs;
     },
     getPercentCompleted: function(){
         if (this.getTotalPoints() > 0){
             return Ext.String.format("{0} % of total points completed", (this.actualPoints / this.getTotalPoints() * 100).toFixed(1));
         }
         return 'No total points to calculate % Completed';
     },
     _getIdealSeries: function(calcs){
         var data = [];
         var endDate = new Date(this.getEndDate());
         var startDate = new Date(this.getStartDate());
         var totalPoints = Number(this.getTotalPoints());
         var num_velocity_periods = Rally.util.DateTime.getDifference(endDate, startDate,'week')/2;
         var velocity = 0;
         var data = [];
         var startDatei = 0;
         console.log(startDate, endDate, calcs);
         var endDatei = calcs.categories.length-1;  
         
         for(var i=0; i< calcs.categories.length; i++){
            var d = new Date(calcs.categories[i]);
            data[i] = null; 
            if (d.getYear() == startDate.getYear() && 
                 d.getMonth() == startDate.getMonth() && 
                 d.getDate() == startDate.getDate()){
                startDatei = i;
            }
            if (d.getYear() == endDate.getYear() && 
                    d.getMonth() == endDate.getMonth() && 
                    d.getDate() == endDate.getDate()){
                endDatei = i;   
               }
         };
         velocity = Math.round(totalPoints/num_velocity_periods);  
         data[startDatei] = 0;
         data[endDatei] = totalPoints;
         var series = {
                 name: Ext.String.format('Ideal (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '',
                 dashStyle: 'Solid',
                 stack: 'ideal'
         };
         console.log('idealseries',series);
         return series;
     },
     _getActualSeries: function(calcs){

         var data = []; 
         var num_velocity_periods = Rally.util.DateTime.getDifference(new Date(calcs.categories[calcs.categories.length-1]), new Date(calcs.categories[0]),'week')/2;
         var velocity = 0;
         var firstInProgressi = 0;
         var states = this.getStateFieldValues(); 
         var firstInState = [];
         for (var i=0; i<states.length; i++){
             firstInState[i] = -1;
         }
         this.actualPoints = 0 ;
         var actual_end_index = 0; 
         var currentDate = new Date();
         for(var i=0; i< calcs.categories.length; i++){
             var d = new Date(calcs.categories[i]);
             data[i] = null; 
             if (d.getYear() >= currentDate.getYear() && 
                  d.getMonth() >= currentDate.getMonth() && 
                  d.getDate() >= currentDate.getDate()){
                 actual_end_index = i;
             }
          };
          if (actual_end_index == 0){
              actual_end_index = calcs.categories.length-1;
          }

         
         Ext.each(calcs.series, function(s){
             console.log(s.name);
             var idx = Ext.Array.indexOf(states, s.name, 0);
             if (idx >= 0 && firstInState[idx] <0){
                 for (var i=0; i<s.data.length; i++){
                     if (s.data[i] > 0){
                         firstInState[idx] = i;
                         i = s.data.length; 
                     }
                 }
             }
             if (s.name == this.AcceptedName){
//                 _.range(s.data.length).map(function () { return null });
                 for (var i=0; i<s.data.length; i++){
                     data[i] = null;
                 }
                 this.actualPoints = s.data[actual_end_index];
             }
         }, this);
         

         //Get the date of first inprogress.  If that doesn't work, then get the first date of the next state
         var actual_start_index = 0;  
         var idx = Ext.Array.indexOf(states, this.InProgressName, 0);
         for (var j=idx; j<firstInState.length; j++){
             if (firstInState[j] >= 0){
                 actual_start_index = firstInState[j];
                 j = firstInState.length; 
             }
         }
         
         data[actual_start_index] = 0;
         data[actual_end_index] = this.actualPoints; 
         velocity = Math.round(this.actualPoints/num_velocity_periods);  
         
         var series = {
                 name: Ext.String.format('Actual (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '',
                 dashStyle: 'Solid',
                 stack: 'actual'
         };
         console.log(series);
         return series;
     },
     constructor: function(config) {
         this.initConfig(config);
         this.callParent(arguments);
     },
     getMetrics: function() {
         var metrics = [];
         Ext.each(this.getStateFieldValues(), function(stateFieldValue){
             metrics.push({
                 field: 'PlanEstimate',
                 as: stateFieldValue,
                 f: 'filteredSum',
                 filterField: this.getStateFieldName(),
                 filterValues: [stateFieldValue],
                 display: 'area'
             });  
         }, this);
         
         metrics.push({
             field: 'PlanEstimate',
             as: 'TotalPoints',
             f: 'sum',
             display: 'line'
         })
         return metrics; 
         
     },
     getDerivedFieldsOnInput: function(){
         return [];
     },
     getDerivedFieldsAfterSummary: function(){
         return [];
     }


 });